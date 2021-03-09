import { LivenessWatcher } from './liveness';
import { parse, format, ParsedMediaType } from 'content-type';
import { TransformJS } from './transform-js';
import { TransformHBS } from './transform-hbs';
import { handleSynthesizedFile } from './synthesize-files';

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

let importMap = {
  '@ember-data/adapter/-private':
    '/deps/@ember-data/adapter-3.25.0/-private.js',
  '@ember-data/model/-private': '/deps/@ember-data/model-3.25.0/-private.js',
  'ember-source/dist/ember-template-compiler':
    '/deps/ember-source-3.25.3/dist/ember-template-compiler.js',
  '@ember-data/adapter/json-api':
    '/deps/@ember-data/adapter-3.25.0/json-api.js',
  '@ember/string': '/deps/@ember/string-1.0.0.js',
  'ember-inflector': '/deps/ember-inflector-4.0.0.js',
  '@ember-data/store/-private': '/deps/@ember-data/store-3.25.0/-private.js',
  '@babel/runtime/helpers/esm/defineProperty':
    '/deps/@babel/runtime-7.13.8/helpers/esm/defineProperty.js',
};

let transformJS = new TransformJS(worker.origin, {
  imports: importMap,
});

let transformHBS = new TransformHBS(worker.origin, {
  imports: importMap,
});

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

    let response =
      (await handleSynthesizedFile(url.pathname)) ??
      (await fetch(event.request));

    let { media, forwardHeaders } = mediaType(response);
    switch (media.type) {
      case 'application/javascript':
        return await transformJS.run(url.pathname, response, forwardHeaders);
      case 'application/vnd.glimmer.hbs':
        return await transformHBS.run(url.pathname, response, forwardHeaders);
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
