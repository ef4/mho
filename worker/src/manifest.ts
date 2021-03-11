import { cached } from './cache-util';
import { Crc32 } from '@aws-crypto/crc32';
import { Minimatch } from 'minimatch';

type Manifest = { files: Record<string, string>; excluded: string[] };

export class ManifestCache {
  getManifest: () => Promise<Manifest>;
  invalidateManifest: () => void;

  private openCache: () => Promise<Cache>;

  constructor(private baseURL: string) {
    let [getManifest, invalidate] = cached(this.loadManifest);
    this.getManifest = getManifest;
    this.invalidateManifest = invalidate;

    let [openCache] = cached(() => self.caches.open('manifest'));
    this.openCache = openCache;
  }

  private async loadManifest(): Promise<Manifest> {
    let response = await fetch('/manifest');
    if (response.status !== 200) {
      throw new Error(
        `error while updating manifest (status ${response.status}`
      );
    }
    return await response.json();
  }

  // make a request through the cache. Responses must use X-Manifest-Dep headers
  // to say which entries in the manifest they depend on, and the cache will
  // keep returning the same response for matching requests until any of those
  // deps change in the manifest.
  async through(
    request: Request,
    handler: (dependsOn: (response: Response) => void) => Promise<Response>
  ): Promise<Response> {
    let cache = await this.openCache();
    let [response, manifest] = await Promise.all([
      cache.match(request),
      this.getManifest(),
    ]);

    if (response) {
      let cacheControl = response.headers.get('cache-control');
      if (cacheControl && /max-age=604800/.test(cacheControl)) {
        return response;
      }

      let depHeader = response.headers.get('X-Manifest-Dep');
      if (depHeader) {
        let deps = JSON.parse(depHeader) as [string, string][];
        if (
          deps.every(
            ([manifestQuery, cacheTag]) =>
              this.cacheTagFor(manifest, manifestQuery) === cacheTag
          )
        ) {
          return response;
        }
      }

      // we had matching request but it either lacks X-Manifest-Dep or has a
      // stale X-Manifest-Dep, so evict it
      await cache.delete(request);
    }

    let tracked = [];
    const dependsOn = (dep: Response) => {
      if (dep.url.startsWith(this.baseURL + '/')) {
        let local = dep.url.replace(this.baseURL, '');
        for (let excluded of manifest.excluded) {
          if (excluded.endsWith('/')) {
            if (local.startsWith(excluded)) {
              console.log(`excluded ${dep.url} because of ${excluded} prefix`);
              return;
            }
          } else {
            if (excluded === local) {
              console.log(
                `excluded ${dep.url} because of ${excluded} exact mach`
              );
              return;
            }
          }
        }
        //console.log(`not excluding ${dep.url}`);
        tracked.push([local, dep.headers.get('etag')]);
      } else {
        console.log(
          `excluded ${dep.url} because its outside base ${this.baseURL}`
        );
      }
    };

    response = await handler(dependsOn);
    if (response.status === 200) {
      await cache.put(request, response.clone());
    }
    return response;
  }

  // this lets you say things like cacheTagFor('/app/components/foo.js') or
  // cacheTagFor('/app/templates/**/*.hbs')
  private cacheTagFor(manifest: Manifest, manifestQuery: string): string {
    let hash = new Crc32();
    let pattern = new Minimatch(manifestQuery);
    for (let [filename, etag] of Object.entries(manifest.files)) {
      if (pattern.match(filename)) {
        hash.update(encoder.encode(filename));
        hash.update(encoder.encode(etag));
      }
    }
    return String(hash.digest());
  }
}

const encoder = new TextEncoder();
