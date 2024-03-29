'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');
const { compatBuild } = require('@embroider/compat');

module.exports = function (defaults) {
  let app = new EmberApp(defaults, {});

  //return app.toTree();

  process.env.STAGE2_ONLY = 'true';

  return compatBuild(app, require('@embroider/webpack').Webpack, {
    staticAddonTrees: true,
    staticAddonTestSupportTrees: true,
    staticComponents: true,
    staticHelpers: true,
    workspaceDir: '../out-ember-app',
    implicitModulesStrategy: 'packageNames',
  });
};
