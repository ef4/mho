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
import { DependencyTracker } from './manifest';
import { ImportMapper } from './import-mapper';
import miniModulesPolyfill from '@embroider/core/src/mini-modules-polyfill';

const macrosConfig = MacrosConfig.for(self);
macrosConfig.importSyncImplementation = 'eager';

// TODO: this won't be needed once we are synthesizes vendor.js
const passthrough = ['/assets/vendor.js'];

async function plugins(
  depend: DependencyTracker,
  mapper: ImportMapper,
  requester: URL
): Promise<TransformOptions['plugins']> {
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
    [inlineHBS, { stage: 3 }],
    [
      modulesAPI,
      {
        ignore: {
          '@ember/debug': ['assert', 'deprecate', 'warn'],
          '@ember/application/deprecations': ['deprecate'],
        },
      },
    ],
    [macrosPlugin, (macrosConfig.babelPluginConfig() as any)[1]],
    miniModulesPolyfill,
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
        requester,
      } as RemapOptions,
    ],
  ];
}

export async function transpile(
  source: string,
  url: URL,
  depend: DependencyTracker,
  mapper: ImportMapper
): Promise<string> {
  let result = transformSync(source, {
    // "filename" is only useful for human debugging of bugs, because babel
    // tries to path.resolve it, so absolute URLs get mangled. Where we really
    // need it, we pass it separately directly to the plugins.
    filename: url.href,
    plugins: await plugins(depend, mapper, url),
    generatorOpts: {
      compact: false,
    },
  });
  return result!.code!;
}

export const transformJS: Transform = async function transformJS({
  url,
  relativePath,
  response,
  forwardHeaders,
  depend,
  mapper,
}: TransformParams): Promise<Response> {
  if (relativePath && passthrough.includes(relativePath)) {
    return response;
  }
  let source = await response.text();
  let result = await transpile(source, url, depend, mapper);
  return new Response(result, {
    headers: forwardHeaders,
    status: response.status,
    statusText: response.statusText,
  });
};
