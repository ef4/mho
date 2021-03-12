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
          cached = { value };
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
