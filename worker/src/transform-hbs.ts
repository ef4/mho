import { loadTemplateCompiler } from './template-compiler';
import { Transform, TransformParams } from './transform';
import { transpile } from './transform-js';

export const transformHBS: Transform = async function transformHBS({
  relativePath,
  url,
  response,
  forwardHeaders,
  depend,
  mapper,
}: TransformParams): Promise<Response> {
  let templateCompilerPromise = depend.onAndWorkCached(
    loadTemplateCompiler,
    (innerDepend) => {
      return loadTemplateCompiler(mapper, innerDepend);
    }
  );

  let [source, templateCompiler] = await Promise.all([
    response.text(),
    templateCompilerPromise,
  ]);

  let rawJS = templateCompiler.compile(relativePath || url.href, source);
  let finalJS = await transpile(rawJS, url, depend, mapper);

  return new Response(finalJS, {
    headers: forwardHeaders,
    status: response.status,
    statusText: response.statusText,
  });
};
