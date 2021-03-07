import { rollup, PluginContext } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import { dirname, relative, resolve, join } from 'path';
import { readFileSync } from 'fs';
import getPackageName from '@embroider/core/src/package-name';
import { explicitRelative } from '@embroider/core/src/paths';
import { Package, PackageCache } from '@embroider/core';

const rfc176 = JSON.parse(
  readFileSync(require.resolve('ember-rfc176-data/mappings.json'), 'utf8')
);

const externals = new Set<string>();
for (let { module } of rfc176) {
  externals.add(module);
}
externals.add('@glimmer/env');
externals.add('ember');

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

  async resolve(
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

    let targetPackage = getPackageName(target);
    if (!targetPackage) {
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
      targetPackage === currentPackage.name &&
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
      plugins: [this.resolvePlugin(pkg), commonjs()],
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
}

async function main() {
  let crawler = new Crawler();
  await crawler.resolve(
    'ember-data',
    readFileSync('../ember-app/dist/.stage2-output', 'utf8') + '/notional.js',
    crawler.packages.get(
      readFileSync('../ember-app/dist/.stage2-output', 'utf8')
    ),
    undefined as any
  );
  await crawler.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(-1);
});
