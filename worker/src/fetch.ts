import { transformJS } from './transform-js';
import { transformHBS } from './transform-hbs';
import { handleSynthesizedFile } from './synthesize-files';
import { ImportMapper } from './import-mapper';
import { ManifestCache } from './manifest';
import { transformHTML } from './transform-html';
import { mediaType } from './media-type';
import { Transform } from './transform';

export class FetchHandler {
  constructor(private origin: string) {}

  private manifestCache = new ManifestCache(this.origin);

  private mapper = new ImportMapper(this.origin, '/importmap.json');

  async handleFetch(event: FetchEvent, alive: boolean): Promise<Response> {
    try {
      let url = new URL(event.request.url);

      if (
        !alive ||
        url.origin !== this.origin ||
        // the service worker doesn't rewrite its own code
        ['/client.js', '/worker.js'].includes(url.pathname) ||
        url.searchParams.get('raw') != null
      ) {
        return await fetch(event.request);
      }

      // whenever we're loading the root HTML page, we invalidate the manifest.
      // That will cause it load fresh once, and then remain stable while serving
      // all the supporting requests for modules and assets consumed within the
      // page.
      if (
        event.request.headers.get('accept')?.split(',').includes('text/html')
      ) {
        this.manifestCache.invalidateManifest();
      }

      let cacheEnabled = url.searchParams.get('nocache') == null;

      return this.manifestCache.requestCached(
        event.request,
        cacheEnabled,
        async (depend) => {
          let response = await handleSynthesizedFile(url.pathname, depend);

          if (response && url.searchParams.get('untranspiled') != null) {
            return response;
          }

          if (!response) {
            response = await fetch(event.request);
            depend.on(response);
          }
          let { media, forwardHeaders } = mediaType(response);
          let transform = transformFor(media.type);
          if (transform) {
            return await transform({
              pathname: url.pathname,
              response,
              forwardHeaders,
              mapper: this.mapper,
              depend,
            });
          }
          return response;
        }
      );
    } catch (err) {
      console.error(err);
      return new Response(`unexpected exception in service worker ${err}`, {
        status: 500,
      });
    }
  }
}

function transformFor(mediaType: string): Transform | undefined {
  switch (mediaType) {
    case 'text/html':
      return transformHTML;
    case 'application/javascript':
      return transformJS;
    case 'application/vnd.glimmer.hbs':
      return transformHBS;
  }
  return undefined;
}
