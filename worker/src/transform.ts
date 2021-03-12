import { ImportMapper } from './import-mapper';
import { DependencyTracker } from './manifest';

export interface TransformParams {
  request: Request;
  response: Response;

  // where our app is mounted
  baseURL: string;

  // the part of request.url that's inside our baseURL. Will be undefined for
  // requests that are outside the baseURL.
  relativePath: string | undefined;

  url: URL; // convenient access to `new URL(request.url)`

  forwardHeaders: Headers;
  depend: DependencyTracker;
  mapper: ImportMapper;
}

export type Transform = (params: TransformParams) => Promise<Response>;
