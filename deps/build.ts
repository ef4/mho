import { rollup, PluginContext } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import { dirname, relative, resolve, join, isAbsolute, basename } from 'path';
import { readFileSync } from 'fs';
import { Package, PackageCache } from '@embroider/core';
import json from '@rollup/plugin-json';

const rfc176 = JSON.parse(
  readFileSync(require.resolve('ember-rfc176-data/mappings.json'), 'utf8')
);

const externals = new Set<string>();
for (let { module } of rfc176) {
  externals.add(module);
}

// more things that are provided by babel
externals.add('@glimmer/env');
externals.add('ember');

// this is a real package but it's still listed in rfc176
externals.delete('@ember/string');

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
  resolver = nodeResolve({ browser: true });

  needsBuild: Set<Package> = new Set();

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

    let targetPackageName = getPackageName(target);
    if (!targetPackageName) {
      // we only handle the bare imports here, local imports go down the normal
      // path
      return null;
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
      return undefined;
    }

    let exteriorSubpath = '.' + target.slice(pkg.name.length);
    let interiorSubpath = './' + relative(pkg.root, id);

    let entrypoints = this.entrypoints.get(pkg);
    if (!entrypoints) {
      entrypoints = new Map();
      this.entrypoints.set(pkg, entrypoints);
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
          join(`${pkg.name}-${pkg.version}`, exterior),
          resolve(pkg.root, interior),
        ])
      ),
      plugins: [this.resolvePlugin(pkg), commonjs(), json()],
    });
    await build.write({
      format: 'esm',
      entryFileNames: `[name].js`,
      dir: `dist`,
      chunkFileNames: `${pkg.name}-${pkg.version}/chunk-[hash].js`,
    });
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

    try {
      await this.resolve(
        specifier,
        join(parent.root, 'index.js'),
        parent,
        undefined as any
      );
    } catch (err) {
      console.warn(
        `can't resolve default entrypoint for ${specifier}, moving on`
      );
    }
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
  let basedir = readFileSync('../ember-app/dist/.stage2-output', 'utf8');
  let app = crawler.packages.getApp(basedir);
  for (let dep of app.dependencies) {
    if (!externals.has(dep.name)) {
      await crawler.addPackage(dep.name, app);
    }
  }
  await crawler.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(-1);
});
