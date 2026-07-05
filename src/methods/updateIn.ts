import { updateIn as _updateIn } from '../functional/updateIn';

export function updateIn(
  this: object,
  keyPath: Iterable<unknown>,
  notSetValue?: unknown,
  updater?: (value: unknown) => unknown
): unknown {
  return _updateIn(this, keyPath, notSetValue, updater);
}
