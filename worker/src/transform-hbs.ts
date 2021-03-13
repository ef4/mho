import { loadTemplateCompiler } from './template-compiler';
import { Transform, TransformParams } from './transform';

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

  let result = templateCompiler.compile(relativePath || url.href, source);
  return new Response(result, {
    headers: forwardHeaders,
    status: response.status,
    statusText: response.statusText,
  });
};
