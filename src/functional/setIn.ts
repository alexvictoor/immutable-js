import { updateIn } from './updateIn';
import { NOT_SET } from '../TrieUtils';

// The signature mirrors the public API in `type-definitions/immutable.d.ts`.
export function setIn<C>(
  collection: C,
  keyPath: Iterable<unknown>,
  value: unknown
): C {
  return updateIn(collection, keyPath, NOT_SET, () => value);
}
