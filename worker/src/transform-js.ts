import { transformSync } from '@babel/core';
import remap from './remap-plugin';
import ts from '@babel/plugin-transform-typescript';

export async function transformJS(
  filename: string,
  response: Response,
  forwardHeaders: Headers
): Promise<Response> {
  let source = await response.text();
  let result = transformSync(source, {
    filename,
    plugins: [ts, remap],
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
