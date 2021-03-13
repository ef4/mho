import { cached } from './cache-util';
import { Crc32 } from '@aws-crypto/crc32';
import { Minimatch } from 'minimatch';

type Manifest = { files: Record<string, string>; excluded: string[] };

export class DependencyTracker {
  private cacheable = true;

  // array of [manifestQuery, cacheKey], where the cacheKeys are the CRC32
  // hashed results of matching the manifestQuery against the manifest
  tags: [string, string][] = [];

  constructor(
    private manifestCache: ManifestCache,
    private baseURL: string,
    private manifest: Manifest,
    private cacheEnabled: boolean
  ) {}

  // this is how you can check for arbitrary file patterns within the app. When
  // you do, you're entangling your cache state with any future changes to the
  // answer you got back.
  queryManifest(query: string) {
    let entries = [];
    let hash = new Crc32();
    for (let { path, etag } of matchingManifestEntries(this.manifest, query)) {
      entries.push(path);
      hash.update(encoder.encode(path));
      hash.update(encoder.encode(etag));
    }
    this.addTag(query, String(hash.digest()));
    return entries;
  }

  // this is how you report that you depended on a network resource
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

    if (!response.url.startsWith(this.baseURL)) {
      // this dependency is outside the scope of our manifest, so our system
      // can't track it
      this.cacheable = false;
      return;
    }

    let local = this.manifestLocalPath(response);
    if (!local) {
      // this dependency is not covered by our manifest
      return;
    }

    if (response.status === 404) {
      // we can account for *not* finding a file just a well as we can account
      // for finding it. The idea is, you've queried the manifest for that name
      // and came back with nothing, which would hash to the digest of nothing.
      // That way, if later the file shows up in the manifest, it will
      // invalidate this tag.
      this.addTag(local, String(new Crc32().digest()));
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
    this.addTag(local, String(hash.digest()));
  }

  private manifestLocalPath(response: Response): string | undefined {
    let url = new URL(response.url);
    if (!url.href.startsWith(this.baseURL)) {
      return undefined;
    }
    let local = (url.origin + url.pathname).replace(this.baseURL, '/');
    for (let excluded of this.manifest.excluded) {
      if (excluded.endsWith('/')) {
        if (local.startsWith(excluded)) {
          return undefined;
        }
      } else {
        if (excluded === local) {
          return undefined;
        }
      }
    }
    return local;
  }

  generateHeader(): string | undefined {
    if (!this.cacheable) {
      return undefined;
    }
    return JSON.stringify(this.tags);
  }

  onAndRequestCached(
    request: Request | string,
    handler?: (depend: DependencyTracker) => Promise<Response>
  ) {
    return this.manifestCache.requestCached(
      request,
      this.cacheEnabled,
      handler,
      this
    );
  }

  onAndWorkCached<K extends object, T>(
    key: K,
    fn: (depend: DependencyTracker) => Promise<T>
  ): Promise<T> {
    return this.manifestCache.workCached(key, this.cacheEnabled, fn, this);
  }

  // TODO: deduplicate tags because we can end up with a lot of copies of the
  // same one. If we encounter two different tags for the same query, set
  // ourself to volatile
  addTag(query: string, tag: string): void {
    this.tags.push([query, tag]);
    if (this.parent) {
      this.parent.addTag(query, tag);
    }
  }

  addTags(pairs: [string, string][]): void {
    for (let pair of pairs) {
      this.addTag(...pair);
    }
  }

  isVolatile() {
    this.cacheable = false;
  }

  invalidateManifest(): void {
    this.manifestCache.invalidateManifest();
  }

  private parent: DependencyTracker | undefined;
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
  async requestCached(
    request: Request | string,
    cacheEnabled: boolean,
    handler?: (depend: DependencyTracker) => Promise<Response>,
    parentTracker?: DependencyTracker
  ): Promise<Response> {
    if (typeof request === 'string') {
      request = new Request(request);
    }

    let cache = await this.openCache();
    let [cachedResponse, manifest] = await Promise.all([
      cache.match(request),
      this.getManifest(),
    ]);

    if (!cacheEnabled) {
      console.log(`cache disabled ${request.url}`);
    } else if (cachedResponse) {
      let tags = parseXManifestDeps(
        cachedResponse.headers.get('x-manifest-deps')
      );
      if (valid(manifest, tags)) {
        //console.log(`cache hit ${request.url}`);
        parentTracker?.addTags(tags);
        return cachedResponse;
      }
      await cache.delete(request);
      console.log(`cache evict ${request.url}`);
    } else {
      console.log(`cache miss ${request.url}`);
    }

    let depend = new DependencyTracker(
      this,
      this.baseURL,
      manifest,
      cacheEnabled
    );
    let freshResponse: Response;
    if (handler) {
      freshResponse = await handler(depend);
    } else {
      freshResponse = await fetch(request);
    }
    parentTracker?.addTags(depend.tags);
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

  private working = new WeakMap<object, Promise<any>>();
  private workCache = new WeakMap<object, { value: any; tag: string }>();

  // Cache arbitrary work relative to the manifest. This is WeakMap based. The
  // same key will return the same cached answer as long as none of the
  // dependencies you reported via the DependencyTracker have changed.
  async workCached<K extends Object, T>(
    key: K,
    cacheEnabled: boolean,
    fn: (depend: DependencyTracker) => Promise<T>,
    parentTracker?: DependencyTracker
  ): Promise<T> {
    let cached = this.workCache.get(key);
    let manifest = await this.getManifest();
    if (!cacheEnabled) {
      console.log(`work cache disabled`, debugKey(key));
    } else if (cached) {
      let tags = parseXManifestDeps(cached.tag);
      if (valid(manifest, tags)) {
        //console.log(`work cache hit `, debugKey(key));
        parentTracker?.addTags(tags);
        return cached.value;
      }
      console.log(`work cache evict`, debugKey(key));
      this.workCache.delete(key);
    } else {
      console.log(`work cache miss`, debugKey(key));
    }

    // we fell through, so we don't have a cached answer. But maybe somebody
    // else is already working on it
    let working = this.working.get(key);
    if (working) {
      // this is easier than entangling the parent tracker with the eventual
      // cache tags that resolve, and it maintains consistency.
      parentTracker?.isVolatile();
      return working;
    }

    let resolve: (value: T) => void;
    let reject: (err: any) => void;
    let promise = new Promise((r, e) => {
      resolve = r;
      reject = e;
    });
    this.working.set(key, promise);
    try {
      let result = await this.runWorkCached(
        key,
        fn,
        parentTracker,
        cacheEnabled,
        manifest
      );
      resolve!(result);
      return result;
    } catch (err) {
      reject!(err);
    } finally {
      this.working.delete(key);
    }
    // typescript is being silly and insisting I put a return statement here.
    return (undefined as unknown) as Promise<T>;
  }

  private async runWorkCached<K extends Object, T>(
    key: K,
    fn: (depend: DependencyTracker) => Promise<T>,
    parentTracker: DependencyTracker | undefined,
    cacheEnabled: boolean,
    manifest: Manifest
  ) {
    let depend = new DependencyTracker(
      this,
      this.baseURL,
      manifest,
      cacheEnabled
    );
    let freshValue = await fn(depend);
    parentTracker?.addTags(depend.tags);
    let tag = depend.generateHeader();
    if (tag) {
      this.workCache.set(key, { value: freshValue, tag });
    }
    return freshValue;
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

function parseXManifestDeps(xManifestDeps: string | null) {
  if (!xManifestDeps) {
    return null;
  }
  return JSON.parse(xManifestDeps) as [string, string][];
}

function valid(
  manifest: Manifest,
  deps: null | [string, string][]
): deps is [string, string][] {
  return Boolean(
    deps && deps.every(([query, key]) => cacheTagFor(manifest, query) === key)
  );
}

const encoder = new TextEncoder();

function debugKey(obj: any): any {
  let str;
  if (typeof obj === 'object' && obj != null) {
    str = String(obj.constructor || obj);
  } else {
    str = String(obj);
  }
  let m = /\W*(?:(?:function|class|async)\W*?)*(\w+)\W/.exec(str);
  if (m) {
    return m[1];
  }
  return obj;
}
