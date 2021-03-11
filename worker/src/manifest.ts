import { cached } from './cache-util';
import { Crc32 } from '@aws-crypto/crc32';
import { Minimatch } from 'minimatch';

type Manifest = { files: Record<string, string>; excluded: string[] };

export class DependencyTracker {
  private cacheable = true;

  // array of [manifestQuery, cacheKey], where the cacheKeys are the CRC32
  // hashed results of matching the manifestQuery against the manifest
  private tags: [string, string][] = [];

  constructor(private baseURL: string, private manifest: Manifest) {}

  *queryManifest(query: string) {
    let entries = [];
    let hash = new Crc32();
    for (let { path, etag } of matchingManifestEntries(this.manifest, query)) {
      entries.push(path);
      hash.update(encoder.encode(path));
      hash.update(encoder.encode(etag));
    }
    this.tags.push([query, String(hash.digest())]);
    return entries;
  }

  on(response: Response): void {
    if (!this.cacheable) {
      // somebody else already made this whole response uncachable, so there's
      // no point in tracking anything else
      return;
    }

    let cacheControl = response.headers.get('cache-control');
    if (cacheControl && /max-age=604800/.test(cacheControl)) {
      // this dependency wants us to consider it immutable, so we oblige by
      // promptly forgetting about it. This is the plan for third-party bundles.
      // They should have versioning in their own URLs.
      return;
    }

    if (!response.url.startsWith(this.baseURL + '/')) {
      // this dependency is outside the scope of our manifest, so our system
      // can't track it
      this.cacheable = false;
      return;
    }

    let local = response.url.replace(this.baseURL, '');
    for (let excluded of this.manifest.excluded) {
      if (excluded.endsWith('/')) {
        if (local.startsWith(excluded)) {
          this.cacheable = false;
          // this dependency is not covered by our manifest
          return;
        }
      } else {
        if (excluded === local) {
          this.cacheable = false;
          // this dependency is not covered by our manifest
          return;
        }
      }
    }

    if (response.status === 404) {
      // we can account for *not* finding a file just a well as we can account
      // for finding it. The idea is, you've queried the manifest for that name
      // and came back with nothing, which would hash to the digest of nothing.
      // That way, if later the file shows up in the manifest, it will
      // invalidate this tag.
      this.tags.push([local, String(new Crc32().digest())]);
      return;
    }

    let etagHeader = response.headers.get('etag');
    if (!etagHeader) {
      // things in our manifest are cached off their etags. If we don't have
      // one, there's no way to ensure cache integrity for this response.
      this.cacheable = false;
      return;
    }
    let etag = etagHeader.slice(1, -1);
    let hash = new Crc32();
    hash.update(encoder.encode(local));
    hash.update(encoder.encode(etag));
    this.tags.push([local, String(hash.digest())]);
  }

  generateHeader(): string | undefined {
    if (!this.cacheable) {
      return undefined;
    }
    return JSON.stringify(this.tags);
  }
}

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
    cacheEnabled: boolean,
    handler: (depend: DependencyTracker) => Promise<Response>
  ): Promise<Response> {
    let cache = await this.openCache();
    let [cachedResponse, manifest] = await Promise.all([
      cache.match(request),
      this.getManifest(),
    ]);

    if (!cacheEnabled) {
      console.log(`cache disabled ${request.url}`);
    } else if (cachedResponse) {
      let xManifestDeps = cachedResponse.headers.get('x-manifest-deps');
      if (xManifestDeps) {
        let deps = JSON.parse(xManifestDeps) as [string, string][];
        if (
          deps.every(([query, key]) => cacheTagFor(manifest, query) === key)
        ) {
          //console.log(`cache hit ${request.url}`);
          return cachedResponse;
        }
      }
      await cache.delete(request);
      console.log(`cache evict ${request.url}`);
    } else {
      console.log(`cache miss ${request.url}`);
    }

    let depend = new DependencyTracker(this.baseURL, manifest);
    let freshResponse = await handler(depend);
    let xManifestDeps = depend.generateHeader();
    if (xManifestDeps) {
      // we need the clone to not steal the body from the consumer we're
      // returning to
      let cloned = freshResponse.clone();
      let headers = new Headers(cloned.headers);
      headers.set('x-manifest-deps', xManifestDeps);

      // but we also need to modify the headers, so we need to invoke the constructor again
      await cache.put(
        request,
        new Response(cloned.body, {
          headers,
          status: cloned.status,
          statusText: cloned.statusText,
        })
      );
    }
    return freshResponse;
  }
}

function* matchingManifestEntries(
  manifest: Manifest,
  query: string
): Generator<{ path: string; etag: string }> {
  let pattern = new Minimatch(query);
  for (let [path, etag] of Object.entries(manifest.files)) {
    if (pattern.match(path)) {
      yield { path, etag };
    }
  }
}

// this lets you say things like cacheTagFor('/app/components/foo.js') or
// cacheTagFor('/app/templates/**/*.hbs')
function cacheTagFor(manifest: Manifest, manifestQuery: string): string {
  let hash = new Crc32();
  for (let { path, etag } of matchingManifestEntries(manifest, manifestQuery)) {
    hash.update(encoder.encode(path));
    hash.update(encoder.encode(etag));
  }
  return String(hash.digest());
}

const encoder = new TextEncoder();
