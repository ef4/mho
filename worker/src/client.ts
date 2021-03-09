import { timeout } from './util';

async function start() {
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.register('./worker.js', {
      scope: '/',
    });
    let registration = await navigator.serviceWorker.ready;
    while (registration.active?.state !== 'activated') {
      await timeout(10);
    }
    // most of this project is in a service worker context, and we have
    // typescript configured that way. But just this file is really in DOM
    // window context.
    // @ts-ignore
    window.location.reload();
  }
}

start();
