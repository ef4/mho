import { Loader } from './loader';
import { accepts } from './media-type';

export const debugParamsLoader: Loader = async function ({
  url,
  depend,
  request,
}) {
  if (url.searchParams.get('network') != null) {
    depend.isVolatile();
    return { response: await fetch(request), transform: false };
  }
  if (url.searchParams.get('untranspiled') != null) {
    return { transform: false };
  }
  return undefined;
};

export const workerSourceLoader: Loader = async function ({
  relativePath,
  depend,
  request,
}) {
  if (relativePath && ['/client.js', '/worker.js'].includes(relativePath)) {
    depend.isVolatile();
    return fetch(request);
  }
  return undefined;
};

export const fetchLoader: Loader = async function ({ request, depend }) {
  let response = await fetch(request);
  // note that we even depend on error responses here -- if we get a 404 for a
  // particular path and that causes later loaders to do something, if that path
  // later changes to not-a-404 we want to invalidate the work
  depend.on(response);

  if (response.status === 404) {
    // in the case of a 404 we defer to later loaders
    return undefined;
  }

  // any other error situation OR success, we claim
  return response;
};

export const indexHTMLFallback: Loader = async function ({ request, url }) {
  if (
    accepts(request, 'text/html') &&
    url.searchParams.get('nofallback') == null
  ) {
    return { rewrite: '/index.html?nofallback' };
  }
  return undefined;
};
