# the-platform: a demo of building entirely in service worker

## Run the prebuilt demo

The prebuilt binary is currently only compiled for OSX (tested on Big Sur). To try on another OS, see the next section.

0. Prerequisite: Node with `npx` command.
1. Clone this repo.
2. cd ember-app
3. npx mho
4. visit localhost:8000

## Building and running from source

This will build _everything_ including the third-party deps (a step you only need to run when you want to change the app's deps).

1. Prerequisites:

- rust: currently tested under 1.52.0-nightly (234781afe 2021-03-07)
- volta

2. Clone this repo

3. yarn install

4. Start the build of the worker code: `cd worker; yarn start`

5. Run the embroider build of the ember app. `cd ember-app; yarn ember build`

6. Build the deps. `cd deps && yarn prepare`

7. Build and run mho: `cd ember-app; yarn start:mho`

## Orientation

When running the prebuilt demo, the `mho` binary contains a prebuilt copy of all the worker code, and the ember-app contains an `importmap.json` pointing at prebuilt dependencies on s3.

When running from scratch:

- running the ember build puts the stage2 build output into `./out-ember-app`.
- building the deps reads from `./out-ember-app` and writes into `/deps/dist` and `./ember-app/importmap.json`
- the worker builds into `./worker/dist`
- we run `mho` with command line options telling it to use the worker code from `./worker-dist` and serve the deps from `./deps/dist`, and the importmap points at the files served from `./deps/dist`

## TODOs

switch to ember beta with no modules polyfill at all!

get test suite passing

finish addon-meta crawling for the other features that are still scaffolded

add Server Sent Events to the server to trigger page refresh
