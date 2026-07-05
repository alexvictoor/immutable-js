import { updateIn } from './updateIn';
import { NOT_SET } from '../TrieUtils';

// The signature mirrors the public API in `type-definitions/immutable.d.ts`.
export function removeIn<C>(collection: C, keyPath: Iterable<unknown>): C {
  return updateIn(collection, keyPath, () => NOT_SET);
}
