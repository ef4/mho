import { parse, resolve, ParsedImportMap } from '@import-maps/resolve';
import { cacheFor } from './cache-for';

export class ImportMapper {
  readonly baseURL: URL;

  private constructor(baseURL: string, private mapURL: string) {
    this.baseURL = new URL(baseURL);
  }

  async resolve(specifier: string, requester: string) {
    let parsed = await this.parsedImportMap();
    return resolve(specifier, parsed, new URL(requester, this.baseURL));
  }

  private parsedImportMap = cacheFor(5000, () => this.loadImportMap());

  private async loadImportMap(): Promise<ParsedImportMap> {
    let response = await fetch(this.mapURL);
    if (response.status !== 200) {
      throw new Error(`error loading import map (status ${response.status})`);
    }
    let json = await response.json();
    return parse(json, this.baseURL);
  }

  async snapshot(): Promise<SyncImportMapper> {
    let parsed = await this.parsedImportMap();
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
