# the-platform: a demo of building entirely in service worker

current goal: minimum viable in-service-worker stage2

need to load the template compiler

and make it respect the new manifest for resolving things from the app

and add explicit app-js file lists to the metadata for the addons, and bake that
into their dep bundles, so we can resolve their components too

# TODOs

make server serve loading HTML until it sees a header from the service worker

make embroider/core web safe and roll remap-plugin into adjust-imports-plugin, etc.

try to change the service worker build to ship as modules, with only a shim entrypoint as a script
