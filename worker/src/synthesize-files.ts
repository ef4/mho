import { addonMeta } from './addon-meta';
import { emberJSEntrypoint } from './ember-entrypoint';
import { ImportMapper } from './import-mapper';
import { Loader } from './loader';
import { DependencyTracker } from './manifest';

export const synthesizedFiles: Loader = async function handleSynthesizedFile({
  relativePath,
  depend,
  mapper,
}) {
  switch (relativePath) {
    case '/assets/vendor.js':
    case '/assets/vendor.css':
    case '/assets/vendor.css.map':
    case '/assets/ember-app.css':
    case '/config/environment.js':
    case '/ember-welcome-page/images/construction.png':
      return scaffold(relativePath, depend);
    case '/':
    case '/index.html':
      return { rewrite: '/app/index.html' };
    case '/_entry_/index.js':
      return emberJSEntrypoint(depend);
    case '/_addon_meta_test':
      return addonMetaTest(depend, mapper);
  }
  return undefined;
};

async function scaffold(
  stage2Name: string,
  depend: DependencyTracker
): Promise<Response> {
  let response = await fetch(`/scaffolding${stage2Name}`);
  depend.on(response);
  return response;
}

async function addonMetaTest(depend: DependencyTracker, mapper: ImportMapper) {
  let meta = await addonMeta(depend, mapper);
  return new Response(JSON.stringify(Object.fromEntries(meta), null, 2));
}
