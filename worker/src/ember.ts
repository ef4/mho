import { compile } from './js-handlebars';
import { DependencyTracker } from './manifest';
import { ImportMapper } from './import-mapper';
import { Loader, LoaderResult } from './loader';
import { Crawler, PackageInfo } from './package-info';
import { AddonMeta } from '@embroider/core';

export const emberEntrypoints: Loader = async function handleSynthesizedFile({
  relativePath,
  depend,
  mapper,
}) {
  let resources = await addonResources(depend, mapper);

  // serve addon's public assets
  if (relativePath) {
    let addonResource = resources.publicAssets.get(relativePath);
    if (addonResource) {
      return { rewrite: addonResource };
    }
  }

  switch (relativePath) {
    // config/environment is special because:
    // - it's authored as /config/environment.js but consumed as /app/config/environment.js
    // - it's authored in CJS and intended to evaluate within the build, not within the runtime
    case '/app/config/environment.js':
      return evaluateConfigEnvironment(
        new URL('/config/environment.js', mapper.baseURL),
        depend
      );
    case '/assets/vendor.js':
    case '/assets/vendor.css':
    case '/assets/vendor.css.map':
    case '/assets/ember-app.css':
      return scaffold(relativePath, depend, mapper);
    case '/':
    case '/index.html':
      return { rewrite: '/app/index.html' };
    case '/_entry_/index.js':
      return emberJSEntrypoint(depend);
    case '/_ember_debug/addon_resources': {
      return new Response(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(resources).map(([k, v]) => [
              k,
              Object.fromEntries(v),
            ])
          ),
          null,
          2
        )
      );
    }
    case '/_ember_debug/app_tree': {
      let m = await availableAppTree(resources.appJS, depend);
      return new Response(JSON.stringify(Object.fromEntries(m), null, 2));
    }
  }
  return undefined;
};

async function scaffold(
  stage2Name: string,
  depend: DependencyTracker,
  mapper: ImportMapper
): Promise<LoaderResult> {
  let resolved = await mapper.resolve(
    `@embroider/synthesized-scaffold${stage2Name}`,
    mapper.baseURL.href,
    depend
  );
  return { rewrite: resolved.resolvedImport };
}

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
  { runtime: 'ember-app/app', buildtime: '/app/app.js' },
  {
    runtime: 'ember-app/component-managers/glimmer',
    buildtime: '@glimmer/component/_app_/component-managers/glimmer.js',
  },
  {
    runtime: 'ember-app/config/environment',
    buildtime: '/app/config/environment.js',
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
  { runtime: 'ember-app/router', buildtime: '/app/router.js' },
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
    runtime: 'ember-app/templates/second',
    buildtime: '../app/templates/second.hbs',
  },

  {
    runtime: '@ember-data/model/-private',
    buildtime: '@ember-data/model/-private',
  },
];

// this is the main cached resource for stuff out of addons. It should only
// change when you change dependencies (causing your import map to change) or if
// one of your addons is being served without long-lived caching headers.
async function addonResources(depend: DependencyTracker, mapper: ImportMapper) {
  return depend.onAndWorkCached(addonResources, async (innerDepend) => {
    let addons = await emberAddons(innerDepend, mapper);
    return gatherAddonResources(addons, mapper.baseURL);
  });
}

async function emberAddons(
  depend: DependencyTracker,
  mapper: ImportMapper
): Promise<PackageInfo[]> {
  let crawler = new Crawler(
    depend,
    mapper,
    (entry) =>
      entry.isTopPackage ||
      entry.json?.keywords?.includes('ember-addon') ||
      false
  );
  await crawler.visit(new URL('/package.json', mapper.baseURL));
  return crawler.listPackages();
}

function v2Meta({ json }: PackageInfo): AddonMeta | undefined {
  if (json?.keywords?.includes('ember-addon')) {
    let meta = (json as any)['ember-addon'];
    if (meta && meta.version >= 2) {
      return meta as AddonMeta;
    }
  }
  return undefined;
}

// files from addons that are active in our app tree. Anything that our app also
// defines will knock things out of here
function availableAppTree(
  addonAppJS: Map<string, URL>,
  depend: DependencyTracker
) {
  let merged = new Map(addonAppJS);
  for (let path of depend.queryManifest('/app/**')) {
    merged.delete(path);
  }
  return merged;
}

function gatherAddonResources(addons: PackageInfo[], baseURL: URL) {
  // appRelativePath -> URL
  let appJS = new Map<string, URL>();

  // runtimeName -> URL
  let implicitModules = new Map<string, URL>();

  // appRelativePath -> URL
  let publicAssets = new Map<string, URL>();

  for (let pkg of addons) {
    let meta = v2Meta(pkg);
    if (!meta) {
      continue;
    }
    if (meta['app-js']) {
      for (let [exterior, interior] of Object.entries(meta['app-js'])) {
        appJS.set('/app' + exterior.slice(1), new URL(interior, pkg.url));
      }
    }
    if (meta['implicit-modules']) {
      for (let path of meta['implicit-modules']) {
        implicitModules.set(
          pkg.json.name + path.slice(1).replace(/\.js$/, ''),
          new URL(path, pkg.url)
        );
      }
    }
    if (meta['public-assets']) {
      for (let [localPath, appRelativeURL] of Object.entries(
        meta['public-assets']
      )) {
        let url = new URL(appRelativeURL, baseURL);
        publicAssets.set(
          url.href.replace(baseURL.href, '/'),
          new URL(localPath, pkg.url + 'e/')
        );
      }
    }
  }
  return { appJS, implicitModules, publicAssets };
}

const configEnvironmentTemplate = compile(
  `export default {{{json-stringify env}}};`
) as (opts: { env: any }) => string;

async function evaluateConfigEnvironment(
  url: URL,
  depend: DependencyTracker
): Promise<LoaderResult> {
  let response = await fetch(url.href);
  depend.on(response);
  if (response.status !== 200) {
    return response;
  }
  let source = await response.text();
  let module = { exports: {} };
  let process = { ENV: {} };
  new Function('module', 'process', source)(module, process);
  let env = (module.exports as any)('development');
  return new Response(configEnvironmentTemplate({ env }), {
    headers: {
      'content-type': 'application/javascript',
    },
  });
}
