import { TransformJS } from './transform-js';
import { TransformHBS } from './transform-hbs';
import { handleSynthesizedFile } from './synthesize-files';
import { ImportMapper } from './import-mapper';
import { ManifestCache } from './manifest';
import { transformHTML } from './transform-html';
import { mediaType } from './media-type';

export class FetchHandler {
  constructor(private origin: string) {}

  private mapper = new ImportMapper(this.origin, '/importmap.json');
  private transformHBS = new TransformHBS(this.mapper);
  private transformJS = new TransformJS(this.mapper, this.transformHBS);
  private manifestCache = new ManifestCache(this.origin);

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

      return this.manifestCache.through(
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
          switch (media.type) {
            case 'text/html':
              return await transformHTML(
                url.pathname,
                response,
                forwardHeaders
              );
            case 'application/javascript':
              return await this.transformJS.run(
                url.pathname,
                response,
                forwardHeaders
              );
            case 'application/vnd.glimmer.hbs':
              return await this.transformHBS.run(
                url.pathname,
                response,
                forwardHeaders
              );
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
