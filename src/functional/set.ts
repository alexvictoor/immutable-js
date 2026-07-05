import { isImmutable } from '../predicates/isImmutable';
import hasOwnProperty from '../utils/hasOwnProperty';
import isDataStructure from '../utils/isDataStructure';
import shallowCopy from '../utils/shallowCopy';
import type {
  Collection,
  Record as ImmutableRecord,
} from '../../type-definitions/immutable';

interface Settable {
  set?: (key: unknown, value: unknown) => unknown;
}

// Overloads mirror the public API in `type-definitions/immutable.d.ts`. The
// final wide overload serves internal deep-path callers (`updateIn`) that
// thread erased values.
export function set<K, V, C extends Collection<K, V>>(
  collection: C,
  key: K,
  value: V
): C;
export function set<
  TProps extends object,
  C extends ImmutableRecord<TProps>,
  K extends keyof TProps
>(record: C, key: K, value: TProps[K]): C;
export function set<V, C extends Array<V>>(
  collection: C,
  key: number,
  value: V
): C;
export function set<C, K extends keyof C>(object: C, key: K, value: C[K]): C;
export function set<V, C extends { [key: string]: V }>(
  collection: C,
  key: string,
  value: V
): C;
export function set(collection: unknown, key: unknown, value: unknown): unknown;
export function set(
  collection: unknown,
  key: unknown,
  value: unknown
): unknown {
  if (!isDataStructure(collection)) {
    throw new TypeError(
      'Cannot update non-data-structure value: ' + collection
    );
  }
  if (isImmutable(collection)) {
    const settable = collection as Settable;
    if (!settable.set) {
      throw new TypeError(
        'Cannot update immutable value without .set() method: ' + collection
      );
    }
    return settable.set(key, value);
  }
  const record = collection as { [key: PropertyKey]: unknown };
  if (
    hasOwnProperty.call(collection, key as PropertyKey) &&
    value === record[key as PropertyKey]
  ) {
    return collection;
  }
  const collectionCopy = shallowCopy(
    collection as { [key: PropertyKey]: unknown }
  );
  collectionCopy[key as PropertyKey] = value;
  return collectionCopy;
}
