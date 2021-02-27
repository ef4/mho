import { LivenessWatcher } from './liveness';

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
  if (!livenessWatcher.alive) {
    // if we're supposed to be deactivated, don't intercept any network requests
    event.respondWith(fetch(event.request));
    return;
  }

  let url = new URL(event.request.url);
  if (url.origin === worker.origin && url.pathname === '/x') {
    event.respondWith(new Response('hello from worker', { status: 200 }));
    return;
  }

  console.log(`passing through ${event.request.url}`);
  event.respondWith(fetch(event.request));
  return;
});
