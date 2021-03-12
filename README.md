# the-platform: a demo of building entirely in service worker

current goal: minimum viable in-service-worker stage2

NEXT: get app booting again with no wildcard scaffolding

- discover addons with app-js by crawling package.json starting with ours and using the importmap between them
  THEN: basics of caching with our manifest

# TODOs

had to manually patch @ember/test-waiters type-only exports

clean up extra things in embroider/core's package.json exports, once we port core code back into core

split template compiler loading out of TransformHBS so we don't need to pass TransformHBS to TransformJS and return templateCompiler method to private

finish updating app-js so it's a true reexport map in json

add file watching to the server. not clear how to do SSE in rocket. Might be
able to do a totally standalone one in a separate thread using hyper.
