# the-platform: a demo of building entirely in service worker

current goal: minimum viable in-service-worker stage2

# TODOs

clean up extra things in embroider/core's package.json exports, once we port core code back into core

split template compiler loading out of TransformHBS so we don't need to pass TransformHBS to TransformJS and return templateCompiler method to private

finish updating app-js so it's a true reexport map in json
