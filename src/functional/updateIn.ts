import { isImmutable } from '../predicates/isImmutable';
import coerceKeyPath from '../utils/coerceKeyPath';
import isDataStructure from '../utils/isDataStructure';
import quoteString from '../utils/quoteString';
import { NOT_SET } from '../TrieUtils';
import { emptyMap } from '../Map';
import { get } from './get';
import { remove } from './remove';
import { set } from './set';

type Updater = (value: unknown) => unknown;

// Overloads mirror the public API in `type-definitions/immutable.d.ts`. The
// final wide overload serves internal callers (`update`, the prototype
// wrappers) whose argument shifting leaves positions erased.
export function updateIn<C>(
  collection: C,
  keyPath: Iterable<unknown>,
  updater: (value: unknown) => unknown
): C;
export function updateIn<C>(
  collection: C,
  keyPath: Iterable<unknown>,
  notSetValue: unknown,
  updater: (value: unknown) => unknown
): C;
export function updateIn(
  collection: unknown,
  keyPath: unknown,
  notSetValue?: unknown,
  updater?: Updater
): unknown;
export function updateIn(
  collection: unknown,
  keyPath: unknown,
  notSetValue?: unknown,
  updater?: Updater
): unknown {
  let resolvedUpdater: Updater;
  let resolvedNotSet: unknown;
  if (!updater) {
    // Arg-shift: called as updateIn(collection, keyPath, updater).
    resolvedUpdater = notSetValue as Updater;
    resolvedNotSet = undefined;
  } else {
    resolvedUpdater = updater;
    resolvedNotSet = notSetValue;
  }
  const updatedValue = updateInDeeply(
    isImmutable(collection),
    collection,
    coerceKeyPath(keyPath),
    0,
    resolvedNotSet,
    resolvedUpdater
  );
  return updatedValue === NOT_SET ? resolvedNotSet : updatedValue;
}

function updateInDeeply(
  inImmutable: boolean,
  existing: unknown,
  keyPath: ArrayLike<unknown>,
  i: number,
  notSetValue: unknown,
  updater: Updater
): unknown {
  const wasNotSet = existing === NOT_SET;
  if (i === keyPath.length) {
    const existingValue = wasNotSet ? notSetValue : existing;
    const newValue = updater(existingValue);
    return newValue === existingValue ? existing : newValue;
  }
  if (!wasNotSet && !isDataStructure(existing)) {
    throw new TypeError(
      'Cannot update within non-data-structure value in path [' +
        // Faithful to 5.0.x: `.slice` is called on the key path itself, so a
        // non-Array array-like key path throws "keyPath.slice is not a
        // function" here (coerceKeyPath passes such values through as-is).
        (keyPath as Array<unknown>).slice(0, i).map(quoteString) +
        ']: ' +
        existing
    );
  }
  const key = keyPath[i];
  const nextExisting = wasNotSet ? NOT_SET : get(existing, key, NOT_SET);
  const nextUpdated = updateInDeeply(
    nextExisting === NOT_SET ? inImmutable : isImmutable(nextExisting),
    nextExisting,
    keyPath,
    i + 1,
    notSetValue,
    updater
  );
  return nextUpdated === nextExisting
    ? existing
    : nextUpdated === NOT_SET
    ? remove(existing, key)
    : set(
        wasNotSet ? (inImmutable ? emptyMap() : {}) : existing,
        key,
        nextUpdated
      );
}
