import { FetchHandler } from './fetch';
import { LivenessWatcher } from './liveness';

const worker = (self as unknown) as ServiceWorkerGlobalScope;
const livenessWatcher = new LivenessWatcher(worker);
const fetchHandler = new FetchHandler(worker.origin);

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
  event.respondWith(fetchHandler.handleFetch(event, livenessWatcher.alive));
});
