import { parse, resolve, ParsedImportMap } from '@import-maps/resolve';
import type { DependencyTracker } from './manifest';

export class ImportMapper {
  readonly baseURL: URL;

  constructor(baseURL: string, private mapURL: string) {
    this.baseURL = new URL(baseURL);
  }

  async resolve(
    specifier: string,
    requester: string,
    depend: DependencyTracker
  ) {
    let parsed = await this.parsedImportMap(depend);
    return resolve(specifier, parsed, new URL(requester, this.baseURL));
  }

  private async parsedImportMap(depend: DependencyTracker) {
    return depend.onAndWorkCached(this, (innerDepend) => {
      return this.loadImportMap(innerDepend);
    });
  }

  private async loadImportMap(
    depend: DependencyTracker
  ): Promise<ParsedImportMap> {
    let response = await fetch(this.mapURL);
    if (response.status !== 200) {
      throw new Error(`error loading import map (status ${response.status})`);
    }
    depend.on(response);
    let json = await response.json();
    return parse(json, this.baseURL);
  }

  async snapshot(depend: DependencyTracker): Promise<SyncImportMapper> {
    let parsed = await this.parsedImportMap(depend);
    return new SyncImportMapper(this.baseURL, parsed);
  }
}

export class SyncImportMapper {
  constructor(
    readonly baseURL: URL,
    private parsedImportMap: ParsedImportMap
  ) {}

  resolve(specifier: string, requester: string) {
    return resolve(
      specifier,
      this.parsedImportMap,
      new URL(requester, this.baseURL)
    );
  }
}
