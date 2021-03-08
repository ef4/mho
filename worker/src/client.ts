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
  }
}

start();

import { TemplateCompiler } from '@embroider/core';
console.log('got template compiler', TemplateCompiler);
