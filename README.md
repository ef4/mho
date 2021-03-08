# the-platform: a demo of building entirely in service worker

current goal: minimum viable in-service-worker stage2

# TODOs

make nginx serve loading HTML until it sees a header from the service worker

make embroider/core web safe and roll remap-plugin into adjust-imports-plugin, etc.

try to change the service worker build to ship as modules, with only a shim entrypoint as a script
