export async function handleSynthesizedFile(
  pathname: string
): Promise<Response | undefined> {
  if (pathname.startsWith('/deps/')) {
    return undefined;
  }
  switch (pathname) {
    case '/client.js':
    case '/worker.js':
      return undefined;
    case '/':
      return scaffold('/index.html');
    case '/index.html':
    case '/assets/vendor.js':
    case '/assets/vendor.css':
    case '/assets/ember-app.css':
    case '/assets/ember-app.js':
      return scaffold(pathname);
    default:
      return scaffold(pathname);
  }
}

function scaffold(stage2Name: string): Promise<Response> {
  return fetch(`/scaffolding${stage2Name}`);
}
