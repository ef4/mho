import { ImportMapper } from './import-mapper';
import { DependencyTracker } from './manifest';

export interface TransformParams {
  pathname: string;
  response: Response;
  forwardHeaders: Headers;
  depend: DependencyTracker;
  mapper: ImportMapper;
}

export type Transform = (params: TransformParams) => Promise<Response>;
