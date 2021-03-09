import { transformSync, TransformOptions } from '@babel/core';
import remap from './remap-plugin';
import ts from '@babel/plugin-transform-typescript';
import { MacrosConfig } from '@embroider/macros/src/node';
import macrosPlugin from '@embroider/macros/src/babel/macros-babel-plugin';
import type { ImportMap } from '@import-maps/resolve';

const macrosConfig = MacrosConfig.for(self);

export class TransformJS {
  private plugins: TransformOptions['plugins'];

  constructor(baseURL: string, importMap: ImportMap) {
    this.plugins = [
      [macrosPlugin, (macrosConfig.babelPluginConfig() as any)[1]],
      ts,
      [
        remap,
        {
          baseURL,
          importMap,
        },
      ],
    ];
  }

  async run(
    filename: string,
    response: Response,
    forwardHeaders: Headers
  ): Promise<Response> {
    let source = await response.text();
    let result = transformSync(source, {
      filename,
      plugins: this.plugins,
      generatorOpts: {
        compact: false,
      },
    });
    return new Response(result!.code, {
      headers: forwardHeaders,
      status: response.status,
      statusText: response.statusText,
    });
  }
}
