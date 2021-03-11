# the-platform: a demo of building entirely in service worker

current goal: minimum viable in-service-worker stage2

NEXT: basics of caching with our manifest
THEN: start to remove use of scaffolding endpoints

# TODOs

had to manually patch @ember/test-waiters type-only exports

clean up extra things in embroider/core's package.json exports, once we port core code back into core

split template compiler loading out of TransformHBS so we don't need to pass TransformHBS to TransformJS and return templateCompiler method to private
