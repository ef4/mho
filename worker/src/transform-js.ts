import { transformSync, TransformOptions } from '@babel/core';
import remap, { RemapOptions } from './remap-plugin';
import ts from '@babel/plugin-transform-typescript';
import { MacrosConfig } from '@embroider/macros/src/node';
import macrosPlugin from '@embroider/macros/src/babel/macros-babel-plugin';
import decorators from '@babel/plugin-proposal-decorators';
import classProperties from '@babel/plugin-proposal-class-properties';
import debugMacros from 'babel-plugin-debug-macros';
import modulesAPI from 'babel-plugin-ember-modules-api-polyfill';
import runtime from '@babel/plugin-transform-runtime';
import makeInlineHBS from '@embroider/core/src/babel-plugin-inline-hbs';
import { Transform, TransformParams } from './transform';
import { loadTemplateCompiler } from './template-compiler';

const macrosConfig = MacrosConfig.for(self);

// TODO: this won't be needed once we are synthesizes vendor.js
const passthrough = ['/assets/vendor.js'];

async function plugins({
  depend,
  mapper,
}: TransformParams): Promise<TransformOptions['plugins']> {
  let templateCompiler = await depend.onAndWorkCached(
    loadTemplateCompiler,
    (innerDepend) => {
      return loadTemplateCompiler(mapper, innerDepend);
    }
  );
  const inlineHBS = makeInlineHBS(() => templateCompiler);

  return [
    [
      decorators,
      {
        legacy: true,
      },
    ],
    [
      classProperties,
      {
        loose: false,
      },
    ],
    [
      debugMacros,
      {
        flags: [
          {
            source: '@glimmer/env',
            flags: {
              DEBUG: true,
              CI: false,
            },
          },
        ],
        externalizeHelpers: {
          global: 'Ember',
        },
        debugTools: {
          isDebug: true,
          source: '@ember/debug',
          assertPredicateIndex: 1,
        },
      },
      '@ember/debug stripping',
    ],
    [
      debugMacros,
      {
        externalizeHelpers: {
          global: 'Ember',
        },
        debugTools: {
          isDebug: true,
          source: '@ember/application/deprecations',
          assertPredicateIndex: 1,
        },
      },
      '@ember/application/deprecations stripping',
    ],
    [
      modulesAPI,
      {
        ignore: {
          '@ember/debug': ['assert', 'deprecate', 'warn'],
          '@ember/application/deprecations': ['deprecate'],
        },
      },
    ],
    [inlineHBS, { stage: 3 }],
    [macrosPlugin, (macrosConfig.babelPluginConfig() as any)[1]],
    // TODO: embroider's template colocation plugin
    [
      runtime,
      {
        useESModules: true,
        regenerator: false,
      },
    ],
    ts,
    [
      remap,
      {
        mapper: await mapper.snapshot(depend),
      } as RemapOptions,
    ],
  ];
}

export const transformJS: Transform = async function transformJS(
  params: TransformParams
): Promise<Response> {
  let { pathname, response, forwardHeaders } = params;
  if (passthrough.includes(pathname)) {
    return response;
  }
  let source = await response.text();
  let result = transformSync(source, {
    filename: pathname,
    plugins: await plugins(params),
    generatorOpts: {
      compact: false,
    },
  });
  return new Response(result!.code, {
    headers: forwardHeaders,
    status: response.status,
    statusText: response.statusText,
  });
};
