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

# embroider web-oriented builds

## Ship the eager importSync implementation

## Go back to requiring explicit hbs extensions

## Require v2 addons have `exports` in package.json

## Make import aliasing pluggable

- via an import-map spec-compatible API
- our current implementation becomes just the node strategy of consuming the import map

## use template lexical scope on ember 3.25+

https://github.com/emberjs/rfcs/blob/1e412bc8d3336141aaa40c5b5e032ad2a2af3e01/text/0496-handlebars-strict-mode.md#low-level-apis
