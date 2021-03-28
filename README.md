# the-platform: a demo of building entirely in service worker

NEXT: we need to bring the mini-modules-polyfill from latest embroider into our transform-js. the babel-modules-polyfill is not good enough because it's too early to cover the output of our other transformations

NEXT: switch to ember beta with no modules polyfill at all!

current goal: minimum viable in-service-worker stage2

NEXT: get test suite passing
THEN: continue on addon-meta crawling

# TODOs

clean up extra things in embroider/core's package.json exports, once we port core code back into core

split template compiler loading out of TransformHBS so we don't need to pass TransformHBS to TransformJS and return templateCompiler method to private

finish updating app-js so it's a true reexport map in json
