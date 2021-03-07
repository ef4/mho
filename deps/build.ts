import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import pkgUp from 'pkg-up';
import { dirname, relative, resolve, join } from 'path';
import { PackageJson } from 'type-fest';
import { readFileSync } from 'fs';

const rfc176 = JSON.parse(
  readFileSync(require.resolve('ember-rfc176-data/mappings.json'), 'utf8')
);

const externals = new Set<string>();
for (let { module } of rfc176) {
  externals.add(module);
}
externals.add('@glimmer/env');
externals.add('ember');

interface PackageInfo {
  entrypoints: { [outside: string]: string };
  pkg: PackageJson;
  name: string;
  dir: string;
}

class Crawler {
  // key is absolute path to the package.json file
  packages: Map<string, PackageInfo> = new Map();

  // creating an instance of the rollup node resolve plugin, but instead of
  // sticking it into rollup we're going to call its resolver directly in order
  // to discover package entrypoints.
  resolver = nodeResolve({ browser: true });

  needsBuild: Set<PackageInfo> = new Set();

  async resolve(target: string, requester: string | undefined) {
    if (/\0/.test(target)) {
      // ignore IDs with null character, these belong to other plugins
      return null;
    }

    if (target[0] === '.' || target[0] === '/') {
      // we only handle the bare imports here, local imports go down the normal
      // path
      return null;
    }

    if (externals.has(target)) {
      return {
        id: target,
        isExternal: true,
      };
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

    let pkgPath = pkgUp.sync({ cwd: dirname(id) });
    if (!pkgPath) {
      throw new Error(`missing package.json for ${id}`);
    }

    let pkgInfo = this.packages.get(pkgPath);
    if (!pkgInfo) {
      let pkg: PackageJson = require(pkgPath);
      pkgInfo = {
        entrypoints: {},
        pkg,
        name: ensureName(pkg, pkgPath),
        dir: dirname(pkgPath),
      };
      this.packages.set(pkgPath, pkgInfo);
    }

    if (!target.startsWith(pkgInfo.name)) {
      throw new Error(`didn't expect ${target} to map inside ${pkgInfo.name}`);
    }
    let exteriorSubpath = '.' + target.slice(pkgInfo.name.length);
    let interiorSubpath = './' + relative(pkgInfo.dir, id);
    let prior = pkgInfo.entrypoints[exteriorSubpath];
    if (prior) {
      if (prior !== interiorSubpath) {
        throw new Error(
          `unpectedly resolved entrypoint ${exteriorSubpath} in ${pkgInfo.name} to ${interiorSubpath} when we had previously seen it as ${prior}`
        );
      }
    } else {
      // the package will need to build or rebuild because we discovered a new entrypoint
      pkgInfo.entrypoints[exteriorSubpath] = interiorSubpath;
      this.needsBuild.add(pkgInfo);
    }
    return {
      id: target,
      isExternal: true,
    };
  }

  async run() {
    while (true) {
      let pkgInfo = [...this.needsBuild][0];
      if (!pkgInfo) {
        return;
      }
      this.needsBuild.delete(pkgInfo);
      await this.build(pkgInfo);
    }
  }

  private async build(pkgInfo: PackageInfo) {
    let build = await rollup({
      external: [...externals],
      input: Object.fromEntries(
        Object.entries(pkgInfo.entrypoints).map(([exterior, interior]) => [
          join(pkgInfo.name, exterior),
          resolve(pkgInfo.dir, interior),
        ])
      ),
      plugins: [this.resolvePlugin, commonjs()],
    });
    await build.write({
      format: 'esm',
      entryFileNames: `[name].js`,
      dir: `dist/${pkgInfo.name}-${pkgInfo.pkg.version}`,
    });
  }

  private get resolvePlugin() {
    let self = this;
    return {
      name: 'the-platform-custom-resolve',
      resolveId(target: string, requester: string | undefined) {
        return self.resolve(target, requester);
      },
    };
  }
}

async function main() {
  let crawler = new Crawler();
  // prime our needsBuild set by resolving some explicit entrypoints
  //await crawler.resolve('lodash-es', '../app/app.ts');
  //await crawler.resolve('pdfmake', '../app/app.ts');
  await crawler.resolve(
    'ember-data',
    readFileSync('../ember-app/dist/.stage2-output', 'utf8')
  );
  await crawler.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(-1);
});

function ensureName(pkg: PackageJson, pkgPath: string): string {
  let name = pkg.name;
  if (!name) {
    throw new Error(`package at ${pkgPath} has no name`);
  }
  return name;
}
