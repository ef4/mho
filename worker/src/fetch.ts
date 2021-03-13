import { transformJS } from './transform-js';
import { transformHBS } from './transform-hbs';
import { emberEntrypoints } from './ember';
import { ImportMapper } from './import-mapper';
import { DependencyTracker, ManifestCache } from './manifest';
import { transformHTML } from './transform-html';
import { accepts, mediaType } from './media-type';
import { Transform } from './transform';
import { Loader } from './loader';
import {
  fetchLoader,
  debugParamsLoader,
  workerSourceLoader,
  indexHTMLFallback,
} from './core-loaders';
import { fourOhFour } from './404';

const loaders: Loader[] = [
  debugParamsLoader,
  workerSourceLoader,
  emberEntrypoints,
  fetchLoader,
  indexHTMLFallback,
];

const transforms: { [type: string]: Transform } = {
  'text/html': transformHTML,
  'application/javascript': transformJS,
  'application/vnd.glimmer.hbs': transformHBS,
};

export class FetchHandler {
  constructor(private baseURL: string) {}

  private manifestCache = new ManifestCache(this.baseURL);
  private mapper = new ImportMapper(this.baseURL, '/importmap.json');

  async handleFetch(request: Request, alive: boolean): Promise<Response> {
    try {
      if (!alive) {
        // if we've been told to shut down, we let all requests pass through
        // unchange
        return await fetch(request);
      }

      let searchParams = new URL(request.url).searchParams;
      if (searchParams.get('dropcache') != null) {
        return await this.doCacheDrop();
      }

      // whenever we're loading the root HTML page, we invalidate the manifest.
      // That will cause it to reload once, and then remain stable while serving
      // all the supporting requests for modules and assets consumed within the
      // page.
      if (accepts(request, 'text/html')) {
        this.manifestCache.invalidateManifest();
      }

      let cacheEnabled = searchParams.get('nocache') == null;

      return this.manifestCache.requestCached(
        request,
        cacheEnabled,
        async (depend) => this.generateResponse(request, depend)
      );
    } catch (err) {
      console.error(err);
      return new Response(`unexpected exception in service worker ${err}`, {
        status: 500,
      });
    }
  }

  private async generateResponse(request: Request, depend: DependencyTracker) {
    let {
      response,
      transformsEnabled,
      relativePath,
      url,
    } = await this.runLoaders(depend, request);

    if (!response) {
      return fourOhFour();
    }

    if (!transformsEnabled) {
      return response;
    }

    let { media, forwardHeaders } = mediaType(response);
    let transform = transforms[media.type];
    if (transform) {
      return await transform({
        request,
        response,
        forwardHeaders,
        mapper: this.mapper,
        depend,
        baseURL: this.baseURL,
        relativePath,
        url,
      });
    }
    return response;
  }

  private async runLoaders(
    depend: DependencyTracker,
    request: Request,
    depth = 0
  ): Promise<{
    response: Response | undefined;
    transformsEnabled: boolean;
    relativePath: string | undefined;
    url: URL;
  }> {
    let url = new URL(request.url);

    let relativePath: string | undefined;
    if (request.url.startsWith(this.baseURL)) {
      relativePath = (url.origin + url.pathname).replace(this.baseURL, '/');
    }

    let transformsEnabled = true;

    for (let loader of loaders) {
      let result = await loader({
        relativePath,
        depend,
        mapper: this.mapper,
        request,
        url,
        baseURL: this.baseURL,
      });
      if (result) {
        if (result instanceof Response) {
          return { response: result, transformsEnabled, relativePath, url };
        }
        if ('transform' in result) {
          transformsEnabled = transformsEnabled && result.transform;
          if (result.response) {
            return {
              response: result.response,
              transformsEnabled,
              relativePath,
              url,
            };
          }
        }
        if ('rewrite' in result) {
          if (depth > 16) {
            throw new Error(
              `rewrite recursion limit: some of your loaders caused an infinite loop`
            );
          }
          let newRequest: Request;
          if (
            typeof result.rewrite === 'string' ||
            result.rewrite instanceof URL
          ) {
            newRequest = new Request(result.rewrite, {
              headers: request.headers,
              method: request.method,
            });
          } else {
            newRequest = result.rewrite;
          }
          return this.runLoaders(depend, newRequest, depth + 1);
        }
      }
    }
    return { response: undefined, transformsEnabled, relativePath, url };
  }

  private async doCacheDrop() {
    let names = await self.caches.keys();
    for (let name of names) {
      await self.caches.delete(name);
    }
    this.manifestCache = new ManifestCache(this.baseURL);
    return new Response(`Caches dropped!`, {
      headers: {
        'content-type': 'text/html',
      },
    });
  }
}
