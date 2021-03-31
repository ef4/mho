import { rollup, PluginContext } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import { dirname, relative, resolve, join, isAbsolute, basename } from 'path';
import { copySync, readFileSync } from 'fs-extra';
import { emberVirtualPackages, PackageCache, Package } from '@embroider/core';
import json from '@rollup/plugin-json';
import rollupBabel from '@rollup/plugin-babel';
import type { ImportMap } from '@import-maps/resolve';
import { writeFileSync } from 'fs';
import rollupHBS from './rollup-hbs-plugin';
import stringify from 'json-stable-stringify';

const targetAppDir = '../ember-app';
const appName = 'ember-app';

const externals = new Set(emberVirtualPackages);

// these are build only dependnecies. To the extent that they show up in browser
// code imports, it's because they're more babel macro behavior (like hbs from
// ember-cli-htmlbars)
externals.add('ember-cli-htmlbars');
externals.add('ember-cli-babel');
externals.add('@ember/optional-features');
externals.add('@embroider/core');
externals.add('@embroider/compat');
externals.add('@embroider/webpack');
externals.add('ember-cli');
externals.add('babel-eslint');
externals.add('broccoli-asset-rev');
externals.add('ember-auto-import');
externals.add('ember-cli-dependency-checker');
externals.add('eslint');
externals.add('prettier');
externals.add('ember-template-lint');
externals.add('eslint-plugin-ember');
externals.add('eslint-config-prettier');
externals.add('eslint-plugin-node');
externals.add('eslint-plugin-prettier');
externals.add('http-server');
externals.add('npm-run-all');

class Crawler {
  packages = new PackageCache();
  entrypoints = new Map<Package, Map<string, string>>();

  // creating an instance of the rollup node resolve plugin, but instead of
  // sticking it into rollup we're going to wrap it so we can intercept as
  // needed. We want it to discover which other packages are needed by the
  // current package, but instead of letting it follow those edges we want to
  // start a separate build for that package.
  resolver = nodeResolve({
    browser: true,
    extensions: ['.mjs', '.js', '.json', '.node', '.hbs'],
  });

  needsBuild: Set<Package> = new Set();

  private interPackageResolutions = new Map<Package, Set<Package>>();

  private async resolve(
    target: string,
    requester: string | undefined,
    currentPackage: Package,
    context: PluginContext
  ) {
    if (/\0/.test(target)) {
      // ignore IDs with null character, these belong to other plugins
      return null;
    }

    if (target === 'require') {
      return 'require';
    }

    // TODO: patch ember-cli-app-version and ember-export-application-global,
    // they're doing bad things
    if (
      target === '../config/environment' &&
      /(ember-cli-app-version|ember-export-application-global)\/_app_/.test(
        requester!
      )
    ) {
      return {
        id: `${appName}/config/environment`,
        external: true,
      };
    }

    let targetPackageName = getPackageName(target);
    if (!targetPackageName) {
      // we only handle the bare imports here, local imports go down the normal
      // path
      return this.resolver.resolveId!.call(this as any, target, requester, {});
    }

    if (externals.has(target)) {
      return {
        id: target,
        external: true,
      };
    }

    if (
      requester &&
      targetPackageName === currentPackage.name &&
      currentPackage.isV2Ember() &&
      currentPackage.meta['auto-upgraded']
    ) {
      let fullPath = target.replace(currentPackage.name, currentPackage.root);
      return context.resolve(
        explicitRelative(dirname(requester), fullPath),
        requester
      );
    }

    let resolved = await this.resolver.resolveId!.call(
      this.resolver as any,
      target,
      requester,
      {}
    );

    let id =
      resolved && (typeof resolved === 'string' ? resolved : resolved.id);
    if (!id) {
      throw new Error(`cannot resolve ${target} from ${requester}`);
    }

    let pkg = this.packages.ownerOfFile(id);

    if (!pkg) {
      throw new Error(`no owning package for ${id}`);
    }

    if (!target.startsWith(pkg.name)) {
      throw new Error(`didn't expect ${target} to map inside ${pkg.name}`);
    }

    // if a rewritten package has no default entrypoint, but its original copy
    // did, we can accidentally skip over the rewritten one and find the copy.
    // This prevents that. We want it to look missing, not accidentally see a v1
    // addon.
    let targetPackage = this.packages.resolve(
      targetPackageName,
      currentPackage
    );
    if (targetPackage.root !== pkg.root) {
      console.log(
        `skipping ${target} because it resolved beyond our rewritten packages`
      );
      return undefined;
    }

    let resolutions = this.interPackageResolutions.get(currentPackage);
    if (!resolutions) {
      resolutions = new Set();
      this.interPackageResolutions.set(currentPackage, resolutions);
    }
    resolutions.add(pkg);

    let exteriorSubpath = '.' + target.slice(pkg.name.length);
    let interiorSubpath = './' + relative(pkg.root, id);

    let entrypoints = this.entrypoints.get(pkg);
    if (!entrypoints) {
      entrypoints = new Map();
      this.entrypoints.set(pkg, entrypoints);

      // TODO: this won't be necessary when we update v1-addon to emit "exports"
      // correctly
      if (pkg.isV2Addon()) {
        let appJS = pkg.meta['app-js'];
        if (appJS) {
          for (let local of Object.values(appJS)) {
            entrypoints.set(local, local);
          }
        }
      }
    }

    let prior = entrypoints.get(exteriorSubpath);
    if (prior) {
      if (prior !== interiorSubpath) {
        throw new Error(
          `unpectedly resolved entrypoint ${exteriorSubpath} in ${pkg.name} to ${interiorSubpath} when we had previously seen it as ${prior}`
        );
      }
    } else {
      // the package will need to build or rebuild because we discovered a new entrypoint
      entrypoints.set(exteriorSubpath, interiorSubpath);
      this.needsBuild.add(pkg);
    }
    return {
      id: target,
      external: true,
    };
  }

  async run() {
    while (true) {
      let pkg = [...this.needsBuild][0];
      if (!pkg) {
        return;
      }
      this.needsBuild.delete(pkg);
      let entrypoints = this.entrypoints.get(pkg);
      if (!entrypoints) {
        throw new Error(`haven't found any entrypoints for ${pkg.name} yet`);
      }
      await this.build(pkg, entrypoints);
    }
  }

  private async build(pkg: Package, entrypoints: Map<string, string>) {
    console.log(`building ${pkg.name}`);
    let build = await rollup({
      input: Object.fromEntries(
        [...entrypoints.entries()].map(([exterior, interior]) => [
          this.urlFor(pkg, exterior),
          resolve(pkg.root, interior),
        ])
      ),
      plugins: [
        // TODO: we're transpiling decorators because I can't find an acorn
        // plugin that parses them.
        rollupBabel({
          plugins: [
            ['@babel/plugin-transform-runtime'],
            ['@babel/plugin-proposal-decorators', { legacy: true }],
            ['@babel/plugin-proposal-class-properties', { loose: true }],
          ],
          compact: false,
          babelHelpers: 'runtime',
        }),
        this.resolvePlugin(pkg),
        rollupHBS(),
        commonjs(),
        json(),
      ],
    });
    await build.write({
      format: 'esm',
      entryFileNames: `[name]`,
      dir: `dist`,
      chunkFileNames: `${this.scopeFor(pkg)}chunk-[hash].js`,
    });
    copySync(
      join(pkg.root, 'package.json'),
      join(`dist`, this.scopeFor(pkg), 'package.json')
    );
    if (pkg.isV2Addon() && pkg.meta['public-assets']) {
      for (let file of Object.keys(pkg.meta['public-assets'])) {
        copySync(
          join(pkg.root, file),
          join('dist', this.scopeFor(pkg), 'e', file)
        );
      }
    }
  }

  private resolvePlugin(pkg: Package) {
    let self = this;
    return {
      name: 'the-platform-custom-resolve',
      resolveId(
        this: PluginContext,
        target: string,
        requester: string | undefined
      ) {
        return self.resolve(target, requester, pkg, this);
      },
      load(target: string) {
        if (target === 'require') {
          return `
            export default window.require;
            const has = window.require.has;
            export { has };
          `;
        }
        return null;
      },
    };
  }

  private scopeFor(pkg: Package): string {
    return `${pkg.name}-${pkg.version}/`;
  }

  private urlFor(pkg: Package, localEntrypoint: string): string {
    if (localEntrypoint === '.') {
      // the bare export of a package is served at index.html
      return join(this.scopeFor(pkg), 'index.js');
    } else {
      // all the other deeper exports are namespace within our URL scheme under
      // "e" for "export". This ensures that no matter how they're named they
      // can never conflict with the bare export or any common chunks that we
      // generate.
      return join(
        this.scopeFor(pkg),
        'e',
        localEntrypoint.replace(/\.js$/, '') + '.js'
      );
    }
  }

  importMap(from: Package, mountPoint = '/deps/'): ImportMap {
    let queue: Package[] = [from];
    let importsForPackage = new Map<Package, Record<string, string>>();
    while (true) {
      let pkg = queue.shift();
      if (!pkg) {
        break;
      }
      if (importsForPackage.has(pkg)) {
        continue;
      }
      let imports: Record<string, string> = {};
      let deps = this.interPackageResolutions.get(pkg);
      if (deps) {
        for (let dep of deps) {
          let entrypoints = this.entrypoints.get(dep);
          if (entrypoints) {
            for (let exterior of entrypoints.keys()) {
              imports[join(dep.name, exterior)] = `${mountPoint}${this.urlFor(
                dep,
                exterior
              )}`;
            }
          }
          imports[
            join(dep.name, 'package.json')
          ] = `${mountPoint}${this.scopeFor(dep)}package.json`;
          queue.push(dep);
        }
      }
      importsForPackage.set(pkg, imports);
    }

    let imports: Record<string, string> = {};
    let scopes: Record<string, Record<string, string>> = {};
    let peers = [...importsForPackage.values()];
    for (let [pkg, pkgImports] of importsForPackage) {
      for (let [name, url] of Object.entries(pkgImports)) {
        if (
          pkg === from ||
          peers.every((peer) => peer[name] == null || peer[name] === url)
        ) {
          // everybody agrees, so go in top level imports
          imports[name] = url;
        } else {
          // somebody disagrees, so keep it in your own scope
          let pkgScope = this.scopeFor(pkg);
          let scoped = scopes[pkgScope];
          if (!scoped) {
            scoped = {};
            scopes[pkgScope] = scoped;
          }
          scoped[name] = url;
        }
      }
    }

    // TODO: your app name here. Also, this is only here because there are
    // addons that try to import this out of the app. We should put a stop to
    // that (by only allowing embroider-generated declarative reexports in
    // app-js).
    imports[`${appName}/config/environment`] = '/app/config/environment.js';

    // TODO: last bits of scaffolding
    imports[
      `@embroider/synthesized-scaffold/`
    ] = `${mountPoint}@embroider/synthesized-scaffold-1.0.0/`;

    return { imports, scopes };
  }

  async addPackage(specifier: string, parent: Package): Promise<void> {
    let name = getPackageName(specifier);
    if (!name) {
      throw new Error(`addPackage only accepts bare specifiers`);
    }
    let pkg = this.packages.resolve(name, parent);

    // first try to handle explicit subpath exports
    let exports = pkg.packageJSON.exports;
    if (exports && typeof exports === 'object' && !Array.isArray(exports)) {
      // POJO exports
      let first = Object.keys(exports)[0];
      if (typeof first === 'string' && first.startsWith('.')) {
        // we found subpath exports, so resolve all of them
        for (let target of Object.keys(exports)) {
          if (target.includes('*') || target.endsWith('/')) {
            // these are capabilities we don't support yet
            continue;
          }
          await this.resolve(
            join(name, target),
            join(parent.root, 'index.js'),
            parent,
            undefined as any
          );
        }

        return;
      }
    }

    await this.resolve(
      name + '/package.json',
      join(parent.root, 'index.js'),
      parent,
      undefined as any
    );

    await this.resolve(
      specifier,
      join(parent.root, 'index.js'),
      parent,
      undefined as any
    );
  }
}

// TODO: use the copy of this in @embroider/core when we port this code into embroider
function getPackageName(specifier: string): string | undefined {
  if (specifier[0] === '.' || specifier[0] === '/') {
    // Not an absolute specifier
    return;
  }
  let parts = specifier.split('/');
  if (specifier[0] === '@') {
    return `${parts[0]}/${parts[1]}`;
  } else {
    return parts[0];
  }
}

// TODO use the copy of this in @embroider/core when we port this code into embroider
export function explicitRelative(fromDir: string, toFile: string) {
  let result = join(relative(fromDir, dirname(toFile)), basename(toFile));
  if (!result.startsWith('/') && !result.startsWith('.')) {
    result = './' + result;
  }
  if (isAbsolute(toFile) && result.endsWith(toFile)) {
    // this prevents silly "relative" paths like
    // "../../../../../Users/you/projects/your/stuff" when we could have just
    // said "/Users/you/projects/your/stuff". The silly path isn't incorrect,
    // but it's unnecessarily verbose.
    return toFile;
  }
  return result;
}

async function main() {
  let crawler = new Crawler();
  let basedir = readFileSync(`${targetAppDir}/dist/.stage2-output`, 'utf8');
  let app = crawler.packages.getApp(basedir);
  for (let dep of app.dependencies) {
    if (!externals.has(dep.name)) {
      await crawler.addPackage(dep.name, app);
    }
  }

  // TODO: v1-add.ts should parse app-js for re-exports and put them into
  // package.json exports so this is automatic
  for (let name of [
    '@glimmer/component/-private/ember-component-manager',
    'ember-cli-app-version/initializer-factory',
    'ember-resolver/resolvers/classic/container-debug-adapter',
    'ember-data/setup-container',
    'ember-page-title/services/page-title',
    'ember-page-title/services/page-title-list',
    'ember-data/store',
    'ember-welcome-page/components/welcome-page',
    'ember-page-title/helpers/page-title',
  ]) {
    await crawler.addPackage(name, app);
  }

  for (let name of [
    '@ember-data/model/-private',
    '@ember-data/debug/setup',
    '@ember-data/store',
  ]) {
    await crawler.addPackage(name, crawler.packages.resolve('ember-data', app));
  }

  await crawler.run();

  // TODO last bits of scaffolding
  for (let name of [
    '/assets/vendor.js',
    '/assets/vendor.css',
    '/assets/vendor.css.map',
    '/assets/ember-app.css',
  ]) {
    copySync(
      join(basedir, name),
      join(`dist/@embroider/synthesized-scaffold-1.0.0/`, name)
    );
  }

  writeFileSync(
    `${targetAppDir}/importmap.json`,
    stringify(
      crawler.importMap(
        app
        //'http://mho-demo.s3-website-us-east-1.amazonaws.com/'
      ),
      { space: 2 }
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(-1);
});
