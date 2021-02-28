import { transform } from '@babel/standalone';
import babelPlugin from './babel-plugin';

export async function transformJS(
  filename: string,
  response: Response,
  forwardHeaders: Headers
): Promise<Response> {
  let source = await response.text();
  let result = transform(source, {
    filename,
    plugins: [babelPlugin],
  });
  return new Response(result.code, {
    headers: forwardHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}
