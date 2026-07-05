import { removeIn } from '../functional/removeIn';

export function deleteIn(this: object, keyPath: Iterable<unknown>): unknown {
  return removeIn(this, keyPath);
}
