import { LivenessWatcher } from './liveness';
import { parse } from 'content-type';

const worker = (self as unknown) as ServiceWorkerGlobalScope;
let livenessWatcher = new LivenessWatcher(worker);

worker.addEventListener('install', () => {
  // force moving on to activation even if another service worker had control
  worker.skipWaiting();
});

worker.addEventListener('activate', () => {
  // takes over when there is *no* existing service worker
  worker.clients.claim();
  console.log('activating service worker');
});

worker.addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleFetch(event));
});

async function handleFetch(event: FetchEvent): Promise<Response> {
  let url = new URL(event.request.url);

  if (!livenessWatcher.alive || url.origin !== worker.origin) {
    return fetch(event.request);
  }

  let response = await fetch(event.request);
  let contentType = response.headers.get('content-type');
  if (contentType) {
    switch (parse(contentType).type) {
      case 'application/javascript':
        return transformJS(response);
    }
  }

  return response;
}

async function transformJS(response: Response): Promise<Response> {
  let source = await response.text();
  source = `/* extra */\n${source}`;
  return new Response(source, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}
