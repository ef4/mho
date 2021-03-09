# the-platform: a demo of building entirely in service worker

current goal: minimum viable in-service-worker stage2

NEXT:

- infer addon entrypoints based on everything reexported from the app tree, plus the app tree itself. Do that in stage1 and put it into package.json exports.
- switch from our whitelist of addons to build to a blacklist
- generate the import map automatically along with the deps

# TODOs

make server serve loading HTML until it sees a header from the service worker

make embroider/core web safe and roll remap-plugin into adjust-imports-plugin, etc.

try to change the service worker build to ship as modules, with only a shim entrypoint as a script
