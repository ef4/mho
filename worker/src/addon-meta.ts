import { ImportMapper } from './import-mapper';
import { DependencyTracker } from './manifest';

export async function addonMeta(
  depend: DependencyTracker,
  mapper: ImportMapper
) {
  return depend.onAndWorkCached(addonMeta, (innerDepend) => {
    return crawl(innerDepend, mapper);
  });
}

async function crawl(depend: DependencyTracker, mapper: ImportMapper) {
  let crawler = new Crawler(depend, mapper);
  await crawler.visit('/package.json', true);
  return crawler.found;
}

class Crawler {
  // urls to package.json contents
  found = new Map<
    string,
    { pkg: any; resolutions: { [name: string]: string } }
  >();

  // urls that are already getting a visit
  seen = new Set<string>();

  constructor(
    private depend: DependencyTracker,
    private mapper: ImportMapper
  ) {}

  async visit(url: string, top = false): Promise<void[] | void> {
    let response = await this.depend.onAndRequestCached(url);
    if (response.status !== 200) {
      return;
    }
    let pkg = await response.json();
    let entry: { pkg: any; resolutions: { [name: string]: string } } = {
      pkg,
      resolutions: {},
    };
    this.found.set(url, entry);
    if (!top && !pkg.keywords?.includes('ember-addon')) {
      return;
    }
    let sections = ['dependencies'];
    if (top) {
      sections.push('devDependencies');
    }
    let depNames = new Set<string>();
    for (let section of sections) {
      if (pkg[section]) {
        for (let name of Object.keys(pkg[section])) {
          depNames.add(name);
        }
      }
    }
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
            this.seen.add(resolution.resolvedImport.href);
            await this.visit(resolution.resolvedImport.href);
          }
        }
      })
    );
  }
}
