import { mergeDeepWithSources } from '../functional/merge';
import type { Merger } from '../functional/merge';

export function mergeDeep(this: object, ...iters: Array<unknown>): unknown {
  return mergeDeepWithSources(this, iters);
}

export function mergeDeepWith(
  this: object,
  merger: Merger,
  ...iters: Array<unknown>
): unknown {
  return mergeDeepWithSources(this, iters, merger);
}
