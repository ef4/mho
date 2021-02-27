import { LivenessWatcher } from './liveness';

const worker = (self as unknown) as ServiceWorkerGlobalScope;
let activating: undefined | Promise<void>;
let activated: () => void;
let livenessWatcher = new LivenessWatcher(worker);

worker.addEventListener('install', () => {
  activating = new Promise<void>((res) => (activated = res));
  // force moving on to activation even if another service worker had control
  worker.skipWaiting();
});

worker.addEventListener('activate', () => {
  // takes over when there is *no* existing service worker
  worker.clients.claim();
  activated();
  console.log('activating service worker');
});

worker.addEventListener('fetch', (event: FetchEvent) => {
  let url = new URL(event.request.url);
  if (!livenessWatcher.alive || url.pathname !== `/x`) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        await activating;
        return new Response('X', { status: 200 });
      } catch (err) {
        return new Response('unhandled exception', { status: 500 });
      }
    })()
  );
});
