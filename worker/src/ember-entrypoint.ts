import { compile } from './js-handlebars';
import { DependencyTracker } from './manifest';
const entryTemplate = compile(`
import { importSync as i, macroCondition, getGlobalConfig } from '@embroider/macros';
let w = window;
let d = w.define;

{{#if styles}}
  if (macroCondition(!getGlobalConfig().fastboot?.isRunning)) {
    {{#each styles as |stylePath| ~}}
      i("{{stylePath.path}}");
    {{/each}}
  }
{{/if}}

{{#each amdModules as |amdModule| ~}}
  d("{{js-string-escape amdModule.runtime}}", function(){ return i("{{js-string-escape amdModule.buildtime}}");});
{{/each}}

{{#if fastbootOnlyAmdModules}}
  if (macroCondition(getGlobalConfig().fastboot?.isRunning)) {
    {{#each fastbootOnlyAmdModules as |amdModule| ~}}
      { runtime: "{{js-string-escape amdModule.runtime}}", buildtime: "{{js-string-escape amdModule.buildtime}}" },;});
    {{/each}}
  }
{{/if}}

{{#each eagerModules as |eagerModule| ~}}
  i("{{js-string-escape eagerModule}}");
{{/each}}

{{#if lazyRoutes}}
w._embroiderRouteBundles_ = [
  {{#each lazyRoutes as |route|}}
  {
    names: {{{json-stringify route.names}}},
    load: function() {
      return import("{{js-string-escape route.path}}");
    }
  },
  {{/each}}
]
{{/if}}

{{#if lazyEngines}}
w._embroiderEngineBundles_ = [
  {{#each lazyEngines as |engine|}}
  {
    names: {{{json-stringify engine.names}}},
    load: function() {
      return import("{{js-string-escape engine.path}}");
    }
  },
  {{/each}}
]
{{/if}}

{{#if autoRun ~}}
if (!runningTests) {
  i("{{js-string-escape mainModule}}").default.create({{{json-stringify appConfig}}});
}
{{else  if appBoot ~}}
  {{{ appBoot }}}
{{/if}}

{{#if testSuffix ~}}
  {{!- TODO: both of these suffixes should get dynamically generated so they incorporate
       any content-for added by addons. -}}


  {{!- this is the traditional tests-suffix.js -}}
  i('../tests/test-helper');
  EmberENV.TESTS_FILE_LOADED = true;
{{/if}}
`) as (params: {
  amdModules: { runtime: string; buildtime: string }[];
  fastbootOnlyAmdModules?: { runtime: string; buildtime: string }[];
  eagerModules?: string[];
  autoRun?: boolean;
  appBoot?: string;
  mainModule?: string;
  appConfig?: unknown;
  testSuffix?: boolean;
  lazyRoutes?: { names: string[]; path: string }[];
  lazyEngines?: { names: string[]; path: string }[];
  styles?: { path: string }[];
}) => string;

export async function emberJSEntrypoint(
  depend: DependencyTracker
): Promise<Response> {
  return new Response(
    entryTemplate({
      amdModules,
      mainModule: '../app/app.js',
      autoRun: true,
      appConfig: { name: 'ember-app', version: '0.0.0+f4c67075' },
    }),
    {
      headers: {
        'content-type': 'application/javascript',
      },
    }
  );
}

let amdModules = [
  {
    runtime: 'ember-app/adapters/-json-api',
    buildtime: 'ember-data/_app_/adapters/-json-api.js',
  },
  { runtime: 'ember-app/app', buildtime: '../app/app.js' },
  {
    runtime: 'ember-app/component-managers/glimmer',
    buildtime: '@glimmer/component/_app_/component-managers/glimmer.js',
  },
  {
    runtime: 'ember-app/config/environment',
    buildtime: '../config/environment.js',
  },
  {
    runtime: 'ember-app/data-adapter',
    buildtime: '@ember-data/debug/_app_/data-adapter.js',
  },
  {
    runtime: 'ember-app/initializers/app-version',
    buildtime: 'ember-cli-app-version/_app_/initializers/app-version.js',
  },
  {
    runtime: 'ember-app/initializers/container-debug-adapter',
    buildtime: 'ember-resolver/_app_/initializers/container-debug-adapter.js',
  },
  {
    runtime: 'ember-app/initializers/ember-data-data-adapter',
    buildtime:
      '@ember-data/debug/_app_/initializers/ember-data-data-adapter.js',
  },
  {
    runtime: 'ember-app/initializers/ember-data',
    buildtime: 'ember-data/_app_/initializers/ember-data.js',
  },
  {
    runtime: 'ember-app/initializers/export-application-global',
    buildtime:
      'ember-export-application-global/_app_/initializers/export-application-global.js',
  },
  {
    runtime: 'ember-app/instance-initializers/ember-data',
    buildtime: 'ember-data/_app_/instance-initializers/ember-data.js',
  },
  { runtime: 'ember-app/router', buildtime: '../app/router.js' },
  {
    runtime: 'ember-app/serializers/-default',
    buildtime: 'ember-data/_app_/serializers/-default.js',
  },
  {
    runtime: 'ember-app/serializers/-json-api',
    buildtime: 'ember-data/_app_/serializers/-json-api.js',
  },
  {
    runtime: 'ember-app/serializers/-rest',
    buildtime: 'ember-data/_app_/serializers/-rest.js',
  },
  {
    runtime: 'ember-app/services/page-title-list',
    buildtime: 'ember-page-title/_app_/services/page-title-list.js',
  },
  {
    runtime: 'ember-app/services/page-title',
    buildtime: 'ember-page-title/_app_/services/page-title.js',
  },
  {
    runtime: 'ember-app/services/store',
    buildtime: 'ember-data/_app_/services/store.js',
  },
  {
    runtime: 'ember-app/transforms/boolean',
    buildtime: 'ember-data/_app_/transforms/boolean.js',
  },
  {
    runtime: 'ember-app/transforms/date',
    buildtime: 'ember-data/_app_/transforms/date.js',
  },
  {
    runtime: 'ember-app/transforms/number',
    buildtime: 'ember-data/_app_/transforms/number.js',
  },
  {
    runtime: 'ember-app/transforms/string',
    buildtime: 'ember-data/_app_/transforms/string.js',
  },
  {
    runtime: 'ember-app/templates/application',
    buildtime: '../app/templates/application.hbs',
  },
  {
    runtime: '@ember-data/model/-private',
    buildtime: '@ember-data/model/-private',
  },
];
