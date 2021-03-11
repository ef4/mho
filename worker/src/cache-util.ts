export function cacheFor<T>(
  ms: number,
  fn: () => Promise<T>
): () => Promise<T> {
  let loading: Promise<T> | undefined;
  let cached: { value: T; expires: number } | undefined;
  return async function () {
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    if (loading) {
      return loading;
    }
    loading = fn();
    loading
      .then((value) => {
        cached = { value, expires: Date.now() + ms };
      })
      .finally(() => {
        loading = undefined;
      });
    return loading;
  };
}

export function cached<T>(
  fn: () => Promise<T>
): [() => Promise<T>, () => void] {
  let loading:
    | {
        promise: Promise<T>;
        resolve: (value: T) => void;
        reject: (err: any) => void;
      }
    | undefined;

  let cached: { value: T } | undefined;

  async function read() {
    if (cached) {
      return cached.value;
    }
    if (loading) {
      return loading.promise;
    }

    let resolve: (value: T) => void;
    let reject: (err: any) => void;
    let promise: Promise<T> = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    loading = { promise, resolve: resolve!, reject: reject! };
    (async () => {
      try {
        let value = await fn();
        if (loading) {
          loading.resolve(value);
        }
      } catch (err) {
        if (loading) {
          loading.reject(err);
        }
      } finally {
        loading = undefined;
      }
    })();
    return loading.promise;
  }
  function invalidate() {
    cached = undefined;
  }
  return [read, invalidate];
}
