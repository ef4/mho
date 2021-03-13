import { ImportMapper } from './import-mapper';
import { DependencyTracker } from './manifest';

export interface LoaderParams {
  request: Request;
  url: URL; // convenient access to `new URL(request.url)`

  // where our app is mounted
  baseURL: string;

  // the part of request.url that's inside our baseURL. This will be undefined
  // for requests that are outside the baseURL.
  relativePath: string | undefined;

  depend: DependencyTracker;
  mapper: ImportMapper;
}

export type LoaderResult =
  | undefined
  | Response
  | {
      response?: Response;

      // you can return `transform: false` to say that your response should be
      // considered done and shouldn't be subjected to any further transforms.
      transform: boolean;
    }
  | {
      // restart the loaders as if the request had looked like this.
      rewrite: Request | string | URL;
    };

export type Loader = (params: LoaderParams) => Promise<LoaderResult>;
