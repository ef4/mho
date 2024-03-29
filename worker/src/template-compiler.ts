import { TemplateCompiler } from '@embroider/core';
import { ImportMapper } from './import-mapper';
import { DependencyTracker } from './manifest';

export async function loadTemplateCompiler(
  mapper: ImportMapper,
  depend: DependencyTracker
): Promise<TemplateCompiler> {
  let compilerPath = await mapper.resolve(
    'ember-source/dist/ember-template-compiler',
    mapper.baseURL.href,
    depend
  );
  if (!compilerPath.matched) {
    throw new Error(`no mapping for ember-source/dist/ember-template-compiler`);
  }
  let response = await depend.onAndRequestCached(
    compilerPath.resolvedImport.href
  );
  if (response.status !== 200) {
    throw new Error(
      `failure while loading ember template compiler (status ${response.status}`
    );
  }
  depend.on(response);

  let src = await response.text();

  // 😢 browsers can't actually evaluate ES modules in service worker scope
  // yet, so after going through the effort to make sure all our deps are ES
  // modules, we need a hack here to evaluate the template compiler. (The
  // worker's own source is all compiled by webpack so there are no ES modules
  // left at runtime, but we can't do that for the template compiler because
  // its source comes from the app, not this worker.)
  let f = new Function(
    'output',
    'Ember',
    // this is horrible but should be pretty reliable. We know there's only a
    // default export and no imports, because this file ships originally as a
    // script and got wrapped up as a module by our dependency builder.
    src.replace(/export default\s+([^\s;]+)[\s;]/, 'output.push($1)')
  );
  let output: unknown[] = [];
  f(output);
  let theExports: any = output[0];
  return new TemplateCompiler({
    loadEmberTemplateCompiler: () => ({
      theExports,
      cacheKey: 'x',
    }),
    EmberENV: {},
    plugins: { ast: [] },
  });
}
