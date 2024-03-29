import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from 'ember-app/config/environment';

// TODO: get embroider's staticHelper tracing to do this automatically
import PageTitle from 'ember-page-title/helpers/page-title';
window.define('ember-app/helpers/page-title', function () {
  return PageTitle;
});

// TODO: get embroider's staticComponent tracing to do this automatically
import WelcomePage from 'ember-welcome-page/components/welcome-page';
window.define('ember-app/components/welcome-page', function () {
  return WelcomePage;
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
