import { KeyedCollection } from '../Collection';
import { NOT_SET } from '../TrieUtils';
import type { OwnerID } from '../TrieUtils';
import { update } from '../functional/update';

type Merger = (oldVal: unknown, value: unknown, key: unknown) => unknown;

export function merge(this: object, ...iters: Array<unknown>): unknown {
  return mergeIntoKeyedWith(this, iters);
}

export function mergeWith(
  this: object,
  merger: unknown,
  ...iters: Array<unknown>
): unknown {
  if (typeof merger !== 'function') {
    throw new TypeError('Invalid merger function: ' + merger);
  }
  return mergeIntoKeyedWith(this, iters, merger as Merger);
}

interface Settable {
  set(key: unknown, value: unknown): Settable;
}

interface MergeTarget {
  toSeq(): { size: number | undefined };
  __ownerID?: OwnerID | undefined;
  // Called WITHOUT `new` — the collection factories (notably a Record factory)
  // may return a shared/identical instance when invoked as a function, an
  // identity the merge fast-path relies on.
  constructor: (value: unknown) => object;
  withMutations(fn: (mutable: Settable) => void): object;
}

function mergeIntoKeyedWith(
  collection: object,
  collections: Array<unknown>,
  merger?: Merger
): object {
  const iters: Array<KeyedCollection<unknown, unknown>> = [];
  for (let ii = 0; ii < collections.length; ii++) {
    const iter = new KeyedCollection<unknown, unknown>(collections[ii]);
    if (iter.size !== 0) {
      iters.push(iter);
    }
  }
  if (iters.length === 0) {
    return collection;
  }
  const target = collection as MergeTarget;
  if (target.toSeq().size === 0 && !target.__ownerID && iters.length === 1) {
    return target.constructor(iters[0]);
  }
  return target.withMutations(coll => {
    const mergeIntoCollection = merger
      ? (value: unknown, key: unknown) => {
          update(coll, key, NOT_SET, oldVal =>
            oldVal === NOT_SET ? value : merger(oldVal, value, key)
          );
        }
      : (value: unknown, key: unknown) => {
          coll.set(key, value);
        };
    for (let ii = 0; ii < iters.length; ii++) {
      iters[ii]!.forEach(mergeIntoCollection);
    }
  });
}
