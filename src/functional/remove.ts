import { isImmutable } from '../predicates/isImmutable';
import hasOwnProperty from '../utils/hasOwnProperty';
import isDataStructure from '../utils/isDataStructure';
import shallowCopy from '../utils/shallowCopy';
import type {
  Collection,
  Record as ImmutableRecord,
} from '../../type-definitions/immutable';

interface Removable {
  remove?: (key: unknown) => unknown;
}

// Overloads mirror the public API in `type-definitions/immutable.d.ts`. The
// final wide overload serves internal deep-path callers (`updateIn`) that
// thread erased values.
export function remove<K, C extends Collection<K, unknown>>(
  collection: C,
  key: K
): C;
export function remove<
  TProps extends object,
  C extends ImmutableRecord<TProps>,
  K extends keyof TProps
>(collection: C, key: K): C;
export function remove<C extends Array<unknown>>(collection: C, key: number): C;
export function remove<C, K extends keyof C>(collection: C, key: K): C;
export function remove<C extends { [key: string]: unknown }, K extends keyof C>(
  collection: C,
  key: K
): C;
export function remove(collection: unknown, key: unknown): unknown;
export function remove(collection: unknown, key: unknown): unknown {
  if (!isDataStructure(collection)) {
    throw new TypeError(
      'Cannot update non-data-structure value: ' + collection
    );
  }
  if (isImmutable(collection)) {
    const removable = collection as Removable;
    if (!removable.remove) {
      throw new TypeError(
        'Cannot update immutable value without .remove() method: ' + collection
      );
    }
    return removable.remove(key);
  }
  if (!hasOwnProperty.call(collection, key as PropertyKey)) {
    return collection;
  }
  const collectionCopy = shallowCopy(
    collection as { [key: PropertyKey]: unknown }
  );
  if (Array.isArray(collectionCopy)) {
    collectionCopy.splice(key as number, 1);
  } else {
    delete collectionCopy[key as PropertyKey];
  }
  return collectionCopy;
}
