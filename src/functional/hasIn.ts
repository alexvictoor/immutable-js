import { getIn } from './getIn';
import { NOT_SET } from '../TrieUtils';

// The signature mirrors the public API in `type-definitions/immutable.d.ts`.
export function hasIn(
  collection: unknown,
  keyPath: Iterable<unknown>
): boolean {
  return getIn(collection, keyPath, NOT_SET) !== NOT_SET;
}
