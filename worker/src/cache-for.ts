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
