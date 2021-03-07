import { LivenessWatcher } from './liveness';
import { parse, format, ParsedMediaType } from 'content-type';
import { transformJS } from './transform-js';

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
  try {
    let url = new URL(event.request.url);

    if (!livenessWatcher.alive || url.origin !== worker.origin) {
      // notice that we're letting this escape our catch. That's OK here.
      return fetch(event.request);
    }

    let response = await fetch(event.request);
    let { media, forwardHeaders } = mediaType(response);
    switch (media.type) {
      case 'application/javascript':
        return await transformJS(url.pathname, response, forwardHeaders);
    }
    return response;
  } catch (err) {
    console.error(err);
    return new Response(`unexpected exception in service worker ${err}`, {
      status: 500,
    });
  }
}

function mediaType(
  response: Response
): { media: ParsedMediaType; forwardHeaders: Headers } {
  let media: ParsedMediaType;
  let forwardHeaders = response.headers;
  let header = response.headers.get('content-type');
  if (header) {
    media = parse(header);
  } else {
    media = { type: 'application/octet-stream', parameters: {} };
  }

  // webservers aren't generally configured to give us a meaningful mime type
  // for typescript. For our purposes, we want to treat it just like Javascript
  // because our Javascript handling is extended to cover TS syntax.
  if (response.url.endsWith('.ts')) {
    media.type = 'application/javascript';
    forwardHeaders = new Headers(forwardHeaders);
    forwardHeaders.set('content-type', format(media));
  }
  return { media, forwardHeaders };
}
