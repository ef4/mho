import { PackageJson } from 'type-fest';
import { ImportMapper } from './import-mapper';
import { DependencyTracker } from './manifest';

export interface PackageInfo {
  pkg: PackageJson;
  url: string; // url to package.json

  isTopPackage: boolean; // does this package have access to devDependencies?

  // URLs to the package.json's of our dependencies
  resolutions: {
    [dependencyName: string]: string;
  };
}

export class Crawler {
  // keys are URLs to package.json files
  packages = new Map<string, PackageInfo>();

  // urls that are already getting a visit
  private seen = new Set<string>();

  constructor(
    private depend: DependencyTracker,
    private mapper: ImportMapper,
    private filter?: (info: PackageInfo) => boolean
  ) {}

  // return in a stable ordering based on (1) the order that dependencies
  // actually appear in the package.json files, with deps before devDeps (2)
  // traversed depth-first.
  listPackages(): PackageInfo[] {
    // the first package we found is necessarily stable -- we didn't parallelize
    // anything until after we discovered its dependencies.
    let queue: string[] = [[...this.packages.keys()][0]];
    let output = new Set<PackageInfo>();
    while (true) {
      let url = queue.shift();
      if (!url) {
        break;
      }
      let pkg = this.packages.get(url);
      if (pkg && !output.has(pkg)) {
        output.add(pkg);
        for (let name of this.dependencyNames(pkg)) {
          let url = pkg.resolutions[name];
          if (url) {
            queue.push(url);
          }
        }
      }
    }
    return [...output];
  }

  private dependencyNames(info: PackageInfo): Set<string> {
    let sections: ('dependencies' | 'devDependencies')[] = ['dependencies'];
    if (info.isTopPackage) {
      sections.push('devDependencies');
    }
    let depNames = new Set<string>();
    for (let section of sections) {
      if (info.pkg[section]) {
        for (let name of Object.keys(info.pkg[section]!)) {
          depNames.add(name);
        }
      }
    }
    return depNames;
  }

  async visit(url: string, isTopPackage = true): Promise<void[] | void> {
    this.seen.add(url);
    let response = await this.depend.onAndRequestCached(url);
    if (response.status !== 200) {
      return;
    }
    let pkg = await response.json();
    let entry: PackageInfo = {
      pkg,
      url,
      isTopPackage,
      resolutions: {},
    };

    if (this.filter && !this.filter(entry)) {
      return;
    }
    this.packages.set(url, entry);
    let depNames = this.dependencyNames(entry);

    return Promise.all(
      [...depNames].map(async (depName) => {
        let resolution = await this.mapper.resolve(
          depName + '/package.json',
          url,
          this.depend
        );
        if (resolution.matched) {
          entry.resolutions[depName] = resolution.resolvedImport.href;
          if (!this.seen.has(resolution.resolvedImport.href)) {
            await this.visit(resolution.resolvedImport.href, false);
          }
        }
      })
    );
  }
}
