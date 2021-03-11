import { LivenessWatcher } from './liveness';
import { parse, format, ParsedMediaType } from 'content-type';
import { TransformJS } from './transform-js';
import { TransformHBS } from './transform-hbs';
import { handleSynthesizedFile } from './synthesize-files';
import { ImportMapper } from './import-mapper';
import { ManifestCache } from './manifest';
import { transformHTML } from './transform-html';

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

// TODO: this won't be needed once we are synthesizes vendor.js
let excludeFromTranspilation = ['/assets/vendor.js'];

let mapper = new ImportMapper(worker.origin, '/importmap.json');
let transformHBS = new TransformHBS(mapper);
let transformJS = new TransformJS(
  mapper,
  transformHBS,
  excludeFromTranspilation
);
let manifestCache = new ManifestCache(worker.origin);

worker.addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleFetch(event));
});

async function handleFetch(event: FetchEvent): Promise<Response> {
  try {
    let url = new URL(event.request.url);

    if (
      !livenessWatcher.alive ||
      url.origin !== worker.origin ||
      // the service worker doesn't rewrite its own code
      ['/client.js', '/worker.js'].includes(url.pathname)
    ) {
      return await fetch(event.request);
    }

    return manifestCache.through(event.request, async (dependsOn) => {
      let response = await handleSynthesizedFile(url.pathname);
      if (!response) {
        response = await fetch(event.request);
      }
      dependsOn(response);
      let { media, forwardHeaders } = mediaType(response);
      switch (media.type) {
        case 'text/html':
          return await transformHTML(url.pathname, response, forwardHeaders);
        case 'application/javascript':
          return await transformJS.run(url.pathname, response, forwardHeaders);
        case 'application/vnd.glimmer.hbs':
          return await transformHBS.run(url.pathname, response, forwardHeaders);
      }
      return response;
    });
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

  if (response.url.endsWith('.hbs')) {
    // we will treat it as handlebars type
    media.type = 'application/vnd.glimmer.hbs';
    forwardHeaders = new Headers(forwardHeaders);
    // we will tell the browser it is javascript
    forwardHeaders.set(
      'content-type',
      format({ type: 'application/javascript', parameters: media.parameters })
    );
  }

  return { media, forwardHeaders };
}
