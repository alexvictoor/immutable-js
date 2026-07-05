import coerceKeyPath from '../utils/coerceKeyPath';
import { NOT_SET } from '../TrieUtils';
import { get } from './get';

// The signature mirrors the public API in `type-definitions/immutable.d.ts`.
export function getIn(
  collection: unknown,
  searchKeyPath: Iterable<unknown>,
  notSetValue?: unknown
): unknown {
  const keyPath = coerceKeyPath(searchKeyPath);
  let i = 0;
  while (i !== keyPath.length) {
    collection = get(collection, keyPath[i++], NOT_SET);
    if (collection === NOT_SET) {
      return notSetValue;
    }
  }
  return collection;
}
