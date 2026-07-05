import { isImmutable } from '../predicates/isImmutable';
import { isIndexed } from '../predicates/isIndexed';
import { isKeyed } from '../predicates/isKeyed';
import { IndexedCollection, KeyedCollection } from '../Collection';
import { Seq } from '../Seq';
import hasOwnProperty from '../utils/hasOwnProperty';
import isDataStructure from '../utils/isDataStructure';
import shallowCopy from '../utils/shallowCopy';

export type Merger = (
  oldValue: unknown,
  newValue: unknown,
  key: unknown
) => unknown;

interface Mergeable {
  mergeWith?: (merger: Merger, ...sources: Array<unknown>) => unknown;
  merge?: (...sources: Array<unknown>) => unknown;
  concat: (...sources: Array<unknown>) => unknown;
}

// The source shapes the public API accepts, as declared in
// `type-definitions/immutable.d.ts`.
type MergeSource =
  | Iterable<unknown>
  | Iterable<[unknown, unknown]>
  | { [key: string]: unknown };

// The four public signatures mirror `type-definitions/immutable.d.ts`; each
// is implemented over a loose implementation signature.
export function merge<C>(collection: C, ...sources: Array<MergeSource>): C;
export function merge(
  collection: unknown,
  ...sources: Array<unknown>
): unknown {
  return mergeWithSources(collection, sources);
}

export function mergeWith<C>(
  merger: Merger,
  collection: C,
  ...sources: Array<MergeSource>
): C;
export function mergeWith(
  merger: Merger,
  collection: unknown,
  ...sources: Array<unknown>
): unknown {
  return mergeWithSources(collection, sources, merger);
}

export function mergeDeep<C>(collection: C, ...sources: Array<MergeSource>): C;
export function mergeDeep(
  collection: unknown,
  ...sources: Array<unknown>
): unknown {
  return mergeDeepWithSources(collection, sources);
}

export function mergeDeepWith<C>(
  merger: Merger,
  collection: C,
  ...sources: Array<MergeSource>
): C;
export function mergeDeepWith(
  merger: Merger,
  collection: unknown,
  ...sources: Array<unknown>
): unknown {
  return mergeDeepWithSources(collection, sources, merger);
}

export function mergeDeepWithSources(
  collection: unknown,
  sources: Array<unknown>,
  merger?: Merger
): unknown {
  return mergeWithSources(collection, sources, deepMergerWith(merger));
}

export function mergeWithSources(
  collection: unknown,
  sources: Array<unknown>,
  merger?: Merger
): unknown {
  if (!isDataStructure(collection)) {
    throw new TypeError(
      'Cannot merge into non-data-structure value: ' + collection
    );
  }
  if (isImmutable(collection)) {
    const mergeable = collection as Mergeable;
    return typeof merger === 'function' && mergeable.mergeWith
      ? mergeable.mergeWith(merger, ...sources)
      : mergeable.merge
      ? mergeable.merge(...sources)
      : mergeable.concat(...sources);
  }
  const isArray = Array.isArray(collection);
  let merged: unknown = collection;
  const mergeItem = isArray
    ? (value: unknown) => {
        // Copy on write
        if (merged === collection) {
          merged = shallowCopy(merged as { [key: PropertyKey]: unknown });
        }
        (merged as Array<unknown>).push(value);
      }
    : (value: unknown, key: unknown) => {
        const target = merged as { [key: PropertyKey]: unknown };
        const propKey = key as PropertyKey;
        const hasVal = hasOwnProperty.call(merged, propKey);
        const nextVal =
          hasVal && merger ? merger(target[propKey], value, key) : value;
        if (!hasVal || nextVal !== target[propKey]) {
          // Copy on write
          if (merged === collection) {
            merged = shallowCopy(merged as { [key: PropertyKey]: unknown });
          }
          (merged as { [key: PropertyKey]: unknown })[propKey] = nextVal;
        }
      };
  for (let i = 0; i < sources.length; i++) {
    // Each source coerces through the constructor matching `collection`'s
    // kind; inference carries the callback types, no annotation needed.
    if (isArray) {
      new IndexedCollection(sources[i]).forEach(mergeItem);
    } else {
      new KeyedCollection(sources[i]).forEach(mergeItem);
    }
  }
  return merged;
}

function deepMergerWith(merger: Merger | undefined): Merger {
  function deepMerger(
    oldValue: unknown,
    newValue: unknown,
    key: unknown
  ): unknown {
    return isDataStructure(oldValue) &&
      isDataStructure(newValue) &&
      areMergeable(oldValue, newValue)
      ? mergeWithSources(oldValue, [newValue], deepMerger)
      : merger
      ? merger(oldValue, newValue, key)
      : newValue;
  }
  return deepMerger;
}

/**
 * It's unclear what the desired behavior is for merging two collections that
 * fall into separate categories between keyed, indexed, or set-like, so we only
 * consider them mergeable if they fall into the same category.
 */
function areMergeable(
  oldDataStructure: unknown,
  newDataStructure: unknown
): boolean {
  const oldSeq = new Seq(oldDataStructure);
  const newSeq = new Seq(newDataStructure);
  // This logic assumes that a sequence can only fall into one of the three
  // categories mentioned above (since there's no `isSetLike()` method).
  return (
    isIndexed(oldSeq) === isIndexed(newSeq) &&
    isKeyed(oldSeq) === isKeyed(newSeq)
  );
}
