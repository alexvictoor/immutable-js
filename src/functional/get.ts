import { isImmutable } from '../predicates/isImmutable';
import { has } from './has';
import type {
  Collection,
  Record as ImmutableRecord,
} from '../../type-definitions/immutable';

interface Gettable {
  get(key: unknown, notSetValue?: unknown): unknown;
}

// Overloads mirror the public API in `type-definitions/immutable.d.ts`. The
// final wide overload serves internal deep-path callers (`getIn`) that thread
// erased values.
export function get<K, V>(collection: Collection<K, V>, key: K): V | undefined;
export function get<K, V, NSV>(
  collection: Collection<K, V>,
  key: K,
  notSetValue: NSV
): V | NSV;
export function get<TProps extends object, K extends keyof TProps>(
  record: ImmutableRecord<TProps>,
  key: K,
  notSetValue: unknown
): TProps[K];
export function get<V>(collection: Array<V>, key: number): V | undefined;
export function get<V, NSV>(
  collection: Array<V>,
  key: number,
  notSetValue: NSV
): V | NSV;
export function get<C extends object, K extends keyof C>(
  object: C,
  key: K,
  notSetValue: unknown
): C[K];
export function get<V>(
  collection: { [key: string]: V },
  key: string
): V | undefined;
export function get<V, NSV>(
  collection: { [key: string]: V },
  key: string,
  notSetValue: NSV
): V | NSV;
export function get(
  collection: unknown,
  key: unknown,
  notSetValue?: unknown
): unknown;
export function get(
  collection: unknown,
  key: unknown,
  notSetValue?: unknown
): unknown {
  if (isImmutable(collection)) {
    return (collection as Gettable).get(key, notSetValue);
  }
  if (!has(collection, key)) {
    return notSetValue;
  }
  const gettable = collection as Partial<Gettable> & {
    [key: PropertyKey]: unknown;
  };
  return typeof gettable.get === 'function'
    ? gettable.get(key)
    : gettable[key as PropertyKey];
}
