'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');
const { compatBuild } = require('@embroider/compat');

module.exports = function (defaults) {
  let app = new EmberApp(defaults, {});

  return compatBuild(app, null, {
    staticAddonTrees: true,
    staticAddonTestSupportTrees: true,
    staticComponents: true,
    staticHelpers: true,
  });
};
