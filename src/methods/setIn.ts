import { setIn as _setIn } from '../functional/setIn';

export function setIn(
  this: object,
  keyPath: Iterable<unknown>,
  v: unknown
): unknown {
  return _setIn(this, keyPath, v);
}
