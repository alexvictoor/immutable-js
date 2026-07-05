import { isImmutable } from '../predicates/isImmutable';
import hasOwnProperty from '../utils/hasOwnProperty';
import isDataStructure from '../utils/isDataStructure';

// Overloads mirror the public API in `type-definitions/immutable.d.ts`. The
// final wide overload serves internal callers (`get`) probing arbitrary
// values, which the runtime answers with `false`.
export function has(collection: object, key: unknown): boolean;
export function has(collection: unknown, key: unknown): boolean;
export function has(collection: unknown, key: unknown): boolean {
  return isImmutable(collection)
    ? (collection as { has(key: unknown): boolean }).has(key)
    : isDataStructure(collection) &&
        hasOwnProperty.call(collection, key as PropertyKey);
}
