import { updateIn } from './updateIn';
import type {
  Collection,
  Record as ImmutableRecord,
} from '../../type-definitions/immutable';

// Overloads mirror the public API in `type-definitions/immutable.d.ts`. The
// final wide overload serves the prototype-attached method wrapper, whose
// argument shifting leaves every position erased.
export function update<K, V, C extends Collection<K, V>>(
  collection: C,
  key: K,
  updater: (value: V | undefined) => V | undefined
): C;
export function update<K, V, C extends Collection<K, V>, NSV>(
  collection: C,
  key: K,
  notSetValue: NSV,
  updater: (value: V | NSV) => V
): C;
export function update<
  TProps extends object,
  C extends ImmutableRecord<TProps>,
  K extends keyof TProps
>(record: C, key: K, updater: (value: TProps[K]) => TProps[K]): C;
export function update<
  TProps extends object,
  C extends ImmutableRecord<TProps>,
  K extends keyof TProps,
  NSV
>(
  record: C,
  key: K,
  notSetValue: NSV,
  updater: (value: TProps[K] | NSV) => TProps[K]
): C;
export function update<V>(
  collection: Array<V>,
  key: number,
  updater: (value: V | undefined) => V | undefined
): Array<V>;
export function update<V, NSV>(
  collection: Array<V>,
  key: number,
  notSetValue: NSV,
  updater: (value: V | NSV) => V
): Array<V>;
export function update<C, K extends keyof C>(
  object: C,
  key: K,
  updater: (value: C[K]) => C[K]
): C;
export function update<C, K extends keyof C, NSV>(
  object: C,
  key: K,
  notSetValue: NSV,
  updater: (value: C[K] | NSV) => C[K]
): C;
export function update<V, C extends { [key: string]: V }, K extends keyof C>(
  collection: C,
  key: K,
  updater: (value: V) => V
): { [key: string]: V };
export function update<
  V,
  C extends { [key: string]: V },
  K extends keyof C,
  NSV
>(
  collection: C,
  key: K,
  notSetValue: NSV,
  updater: (value: V | NSV) => V
): { [key: string]: V };
export function update(
  collection: unknown,
  key: unknown,
  notSetValue?: unknown,
  updater?: (value: unknown) => unknown
): unknown;
export function update(
  collection: unknown,
  key: unknown,
  notSetValue?: unknown,
  updater?: (value: unknown) => unknown
): unknown {
  return updateIn(collection, [key], notSetValue, updater);
}
