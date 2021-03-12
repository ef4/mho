import { addonMeta } from './addon-meta';
import { emberJSEntrypoint } from './ember-entrypoint';
import { ImportMapper } from './import-mapper';
import { DependencyTracker } from './manifest';

export async function handleSynthesizedFile(
  pathname: string,
  depend: DependencyTracker,
  mapper: ImportMapper
): Promise<Response | undefined> {
  switch (pathname) {
    case '/assets/vendor.js':
    case '/assets/vendor.css':
    case '/assets/vendor.css.map':
    case '/assets/ember-app.css':
    case '/config/environment.js':
    case '/ember-welcome-page/images/construction.png':
      return scaffold(pathname, depend);
    case '/':
    case '/index.html':
      let response = await fetch(`/app/index.html`);
      depend.on(response);
      return response;
    case '/_entry_/index.js':
      return emberJSEntrypoint(depend);
    case '/_addon_meta_test':
      return addonMetaTest(depend, mapper);
  }
  return undefined;
}

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
