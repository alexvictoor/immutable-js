import { is } from '../is';
import { NOT_SET } from '../TrieUtils';
import { isCollection } from '../predicates/isCollection';
import { isKeyed } from '../predicates/isKeyed';
import { isIndexed } from '../predicates/isIndexed';
import { isAssociative } from '../predicates/isAssociative';
import { isOrdered } from '../predicates/isOrdered';
import type { IterableLike } from '../internalTypes';

// `deepEqual` receives values already known to be collections (it is the
// implementation of `.equals()`). This is the minimal structural surface the
// comparison relies on; both the internal mixin `this` view and (via a plain
// downcast) a public `Collection` satisfy it.
interface EqCollection
  extends Pick<
    IterableLike<unknown, unknown>,
    'size' | '__hash' | '__iterate'
  > {
  cacheResult?: (() => unknown) | undefined;
  // Loose by necessity: `Repeat`/`Range` pass their PUBLIC `entries()`, whose
  // lib `IteratorYieldResult` has `done?: false` — not assignable to the
  // internal discriminated `IteratorResult`. This shape is the honest
  // supertype of both.
  entries(): {
    next(): { value: [unknown, unknown] | undefined; done?: boolean };
  };
  every(predicate: (value: unknown, key: unknown) => boolean): boolean;
  has(key: unknown): boolean;
  get(key: unknown, notSetValue: unknown): unknown;
}

export default function deepEqual(a: EqCollection, b: unknown): boolean {
  if ((a as unknown) === b) {
    return true;
  }

  // Structural view of `b`, taken while it is still `unknown`; only relied
  // upon after the isCollection check below establishes it is a collection.
  const bColl = b as EqCollection;

  if (
    !isCollection(b) ||
    (a.size !== undefined &&
      bColl.size !== undefined &&
      a.size !== bColl.size) ||
    (a.__hash !== undefined &&
      bColl.__hash !== undefined &&
      a.__hash !== bColl.__hash) ||
    isKeyed(a) !== isKeyed(b) ||
    isIndexed(a) !== isIndexed(b) ||
    isOrdered(a) !== isOrdered(b)
  ) {
    return false;
  }

  let x: EqCollection = a;
  let y: EqCollection = bColl;

  if (x.size === 0 && y.size === 0) {
    return true;
  }

  const notAssociative = !isAssociative(a);

  if (isOrdered(a)) {
    const entries = x.entries();
    return (
      y.every((v, k) => {
        const entry = entries.next().value;
        return !!(
          entry &&
          is(entry[1], v) &&
          (notAssociative || is(entry[0], k))
        );
      }) && !!entries.next().done
    );
  }

  let flipped = false;

  if (x.size === undefined) {
    if (y.size === undefined) {
      if (typeof x.cacheResult === 'function') {
        x.cacheResult();
      }
    } else {
      flipped = true;
      const _ = x;
      x = y;
      y = _;
    }
  }

  let allEqual = true;
  const bSize = y.__iterate((v, k) => {
    if (
      notAssociative
        ? !x.has(v)
        : flipped
        ? !is(v, x.get(k, NOT_SET))
        : !is(x.get(k, NOT_SET), v)
    ) {
      allEqual = false;
      return false;
    }
    return undefined;
  });

  return allEqual && x.size === bSize;
}
