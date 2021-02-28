# the-platform: a demo of building entirely in service worker

## NEXT STEPS

1. Make `app` consume lodash from NPM.

   - rollup one module per package, but leaving indirection (differs from snowpack strategy)
   - probably need some recipes

2. Make `app` consume something with a second level dependency.

   - this is where we start needed the left-in indirection
   - the in-browser transpilation takes the yarn.lock as input and uses it to resolve inter-package links

3. Roll up a v2 addon
   - probably needs to build in the context of an empty app to capture synthesized-vendor, etc
   - probably needs to export some metadata that would otherwise be in package.json
