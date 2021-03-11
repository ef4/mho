export async function handleSynthesizedFile(
  pathname: string
): Promise<Response | undefined> {
  switch (pathname) {
    case '/assets/vendor.js':
    case '/assets/vendor.css':
    case '/assets/ember-app.css':
      return scaffold(pathname);
    case '/':
    case '/index.html':
      return fetch(`/app/index.html`);
    case '/_entry_/index.js':
      return emberJSEntrypoint(pathname);
  }
  return undefined;
}

function scaffold(stage2Name: string): Promise<Response> {
  return fetch(`/scaffolding${stage2Name}`);
}

async function emberJSEntrypoint(pathname: string): Promise<Response> {
  return new Response(`console.log('entrypoint goes here')`, {
    headers: {
      'content-type': 'application/javascript',
    },
  });
}
