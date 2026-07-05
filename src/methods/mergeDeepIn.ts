import { mergeDeepWithSources } from '../functional/merge';
import { updateIn } from '../functional/updateIn';
import { emptyMap } from '../Map';

export function mergeDeepIn(
  this: object,
  keyPath: Iterable<unknown>,
  ...iters: Array<unknown>
): unknown {
  return updateIn(this, keyPath, emptyMap(), m =>
    mergeDeepWithSources(m, iters)
  );
}
