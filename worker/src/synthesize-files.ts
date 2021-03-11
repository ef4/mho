import { emberJSEntrypoint } from './ember-entrypoint';

export async function handleSynthesizedFile(
  pathname: string
): Promise<Response | undefined> {
  switch (pathname) {
    case '/assets/vendor.js':
    case '/assets/vendor.css':
    case '/assets/ember-app.css':
    case '/config/environment.js':
    case '/ember-welcome-page/images/construction.png':
      return scaffold(pathname);
    case '/':
    case '/index.html':
      return fetch(`/app/index.html`);
    case '/_entry_/index.js':
      return emberJSEntrypoint();
  }
  return undefined;
}

function scaffold(stage2Name: string): Promise<Response> {
  return fetch(`/scaffolding${stage2Name}`);
}
