import { mergeWithSources } from '../functional/merge';
import { updateIn } from '../functional/updateIn';
import { emptyMap } from '../Map';

export function mergeIn(
  this: object,
  keyPath: Iterable<unknown>,
  ...iters: Array<unknown>
): unknown {
  return updateIn(this, keyPath, emptyMap(), m => mergeWithSources(m, iters));
}
