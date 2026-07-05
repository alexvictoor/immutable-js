import {
  CONSTRUCT,
  NOT_SET,
  ensureSize,
  wrapIndex,
  wholeSlice,
  resolveBegin,
  resolveEnd,
} from './TrieUtils';
import {
  Collection,
  KeyedCollection,
  SetCollection,
  IndexedCollection,
} from './Collection';
import { isCollection } from './predicates/isCollection';
import { isKeyed } from './predicates/isKeyed';
import { isIndexed } from './predicates/isIndexed';
import { isOrdered, IS_ORDERED_SYMBOL } from './predicates/isOrdered';
import { isSeq } from './predicates/isSeq';
import {
  getIterator,
  Iterator,
  iteratorValue,
  iteratorDone,
  ITERATE_KEYS,
  ITERATE_VALUES,
  ITERATE_ENTRIES,
} from './Iterator';
import {
  Seq,
  KeyedSeq,
  SetSeq,
  IndexedSeq,
  keyedSeqFromValue,
  indexedSeqFromValue,
  ArraySeq,
} from './Seq';

import { Map } from './Map';
import { OrderedMap } from './OrderedMap';
import type { Seq as ISeq } from '../type-definitions/immutable';
import {
  callableAs,
  reparam,
  viewAs,
  viewCollectionAs,
  writable,
} from './utils/reinterpret';
import type {
  IterateType,
  IterationMethods,
  ImmutableIterator,
  ImmIteratorResult,
  IteratorStep,
  IteratorValueResult,
  SideEffect,
  ThisArg,
  UncachedIterationMethods,
} from './internalTypes';

// Re-exported from `internalTypes` (their single home) for the many modules
// that import the callback vocabulary from here.
export type { IterationResult, ThisArg } from './internalTypes';

/** A `SideEffect` whose `iter` is only known to be some collection object. */
export type Predicate<K = unknown, V = unknown> = SideEffect<K, V, object>;
export type Mapper<K = unknown, V = unknown, M = unknown> = (
  value: V,
  key: K,
  iter: object
) => M;
export type Comparator<T = unknown> = (a: T, b: T) => number;

/**
 * The mutable "operation sequence" surface. Factories build a lazy sequence by
 * `Object.create`-ing a Seq prototype and assigning `__iterate(Uncached)` /
 * `get` / `size` / ... onto it. Members are optional & writable to model that.
 * K/V generics propagate wherever the shape is known; the few remaining
 * `unknown`s mark genuinely erased positions — never `any`.
 */
export interface OpSeq<K = unknown, V = unknown>
  extends IterationMethods<K, V, Predicate<K, V>>,
    UncachedIterationMethods<K, V, Predicate<K, V>> {
  size: number | undefined;
  // The wrapped source of a derived sequence; its key/value types generally
  // differ from this sequence's own (flip, entrySeq, ...), so it stays generic.
  _iter?: OpSeq;
  _useKeys?: boolean;
  // NOTE: members use METHOD syntax deliberately. Under `strictFunctionTypes`
  // only function-PROPERTY syntax is checked contravariantly; method syntax is
  // bivariant, which makes concrete collections (whose callbacks take precise
  // generic params) comparable to this view with a single `as`
  // — no `as unknown as` needed. Method members remain writable, so factories
  // can still assign onto the built sequence objects.
  //
  // `get`'s return and a few factory-assigned members stay wide: their
  // implementations are plain arrows assigned by the factories, and method
  // RETURN positions are covariant even under bivariance.
  // Query / access — required: attached on the base Collection prototype,
  // present on every collection an OpSeq can view (unlike the genuinely
  // conditional `flip?`/`cacheResult?`, which only some kinds carry).
  get(key: K, notSetValue?: unknown): unknown;
  has(key: K): boolean;
  includes(value: V): boolean;
  some(predicate: Predicate<K, V>, context?: ThisArg): boolean;
  every(predicate: Predicate<K, V>, context?: ThisArg): boolean;
  find<NSV = undefined>(
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): V | NSV;
  findEntry<NSV = undefined>(
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): [K, V] | NSV;
  findKey(predicate: Predicate<K, V>, context?: ThisArg): K | undefined;
  findLast<NSV = undefined>(
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): V | NSV;
  findLastEntry<NSV = undefined>(
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): [K, V] | NSV;
  findLastKey(predicate: Predicate<K, V>, context?: ThisArg): K | undefined;
  first<NSV = undefined>(notSetValue?: NSV): V | NSV;
  count(predicate?: Predicate<K, V>, context?: ThisArg): number;
  // (`indexOf`/`lastIndexOf` are deliberately absent: they exist only on
  // indexed collections — the Indexed mixin attaches them — so declaring them
  // here would let keyed/set-backed views call them and throw at runtime.)
  keyOf(value: V): K | undefined;
  lastKeyOf(value: V): K | undefined;
  join(separator?: string): string;
  // Transforms (chainable)
  flip?(): OpSeq<V, K>;
  reverse(): OpSeq<K, V>;
  valueSeq(): OpSeq<number, V>;
  keySeq(): OpSeq<number, K>;
  entrySeq(): OpSeq<number, [K, V]>;
  fromEntrySeq(): OpSeq;
  toSeq(): OpSeq<K, V>;
  toKeyedSeq(): OpSeq<K, V>;
  toIndexedSeq(): OpSeq<number, V>;
  toSetSeq(): OpSeq<V, V>;
  filter(predicate: Predicate<K, V>, context?: ThisArg): OpSeq<K, V>;
  filterNot(predicate: Predicate<K, V>, context?: ThisArg): OpSeq<K, V>;
  slice(begin?: number, end?: number): OpSeq<K, V>;
  flatten(deep?: boolean | number): OpSeq;
  flatMap(mapper: Mapper<K, V>, context?: ThisArg): OpSeq;
  map<M>(mapper: Mapper<K, V, M>, context?: ThisArg): OpSeq<K, M>;
  concat(...values: Array<unknown>): OpSeq;
  cacheResult?(): OpSeq<K, V>;
  reduce<R>(
    reducer: (reduction: R, value: V, key: K, iter: object) => R,
    initial?: R,
    context?: ThisArg
  ): R;
  min(): V | undefined;
  max(): V | undefined;
  toArray(): Array<V>;
  // (`__iterate`/`__iterator` and the uncached pair are inherited from
  // `IterationMethods`/`UncachedIterationMethods`, instantiated with
  // `Predicate` as the callback.)
  // The coercion factory of this sequence's kind: accepts any raw input and
  // constructs a collection of that kind, which carries whatever K/V view its
  // input had — hence the free generics (this is where the runtime kind/type
  // erasure meets the type system, once).
  constructor: <CK, CV>(value?: unknown) => OpSeq<CK, CV>;
}

type Entry<K = unknown, V = unknown> = [K, V];

export class ToKeyedSequence<K, V> extends KeyedSeq<K, V> {
  _iter: OpSeq<K, V>;
  _useKeys: boolean;

  constructor(indexed: OpSeq<K, V>, useKeys: boolean) {
    super(CONSTRUCT);
    this._iter = indexed;
    this._useKeys = useKeys;
    this.size = indexed.size;
  }

  get<NSV>(key: K, notSetValue?: NSV): V | NSV {
    // OpSeq.get is wide (its notSetValue also carries internal sentinels);
    // this override narrows back to the public shape.
    return this._iter.get(key, notSetValue) as V | NSV;
  }

  has(key: K): boolean {
    return this._iter.has(key);
  }

  // These override public methods; the lazy factories build loosely-typed
  // OpSeqs, cast back to the precise public return type at this seam.
  valueSeq(): ISeq.Indexed<V> {
    return viewCollectionAs<ISeq.Indexed<V>>(this._iter.valueSeq());
  }

  reverse(): this {
    const reversedSequence = reverseFactory(
      viewCollectionAs<OpSeq<K, V>>(this),
      true
    );
    if (!this._useKeys) {
      // !useKeys => the wrapped source is indexed (number keys).
      reversedSequence.valueSeq = () =>
        reparam<OpSeq<number, V>>(this._iter.toSeq().reverse());
    }
    return viewCollectionAs<this>(reversedSequence);
  }

  map<M>(
    mapper: (value: V, key: K, iter: this) => M,
    context?: ThisArg
  ): ISeq.Keyed<K, M> {
    const m = mapper as Mapper<K, V, M>;
    const mappedSequence = mapFactory(
      viewCollectionAs<OpSeq<K, V>>(this),
      m,
      context
    );
    if (!this._useKeys) {
      // !useKeys => the wrapped source is indexed (number keys).
      mappedSequence.valueSeq = () =>
        reparam<OpSeq<number, M>>(this._iter.toSeq().map(m, context));
    }
    return viewCollectionAs<ISeq.Keyed<K, M>>(mappedSequence);
  }

  __iterate(fn: SideEffect<K, V, this>, reverse?: boolean): number {
    return this._iter.__iterate((v, k) => fn(v, k, this), reverse);
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, V>> {
    return this._iter.__iterator(type, reverse);
  }
}
writable(ToKeyedSequence.prototype)[IS_ORDERED_SYMBOL] = true;

export class ToIndexedSequence<V> extends IndexedSeq<V> {
  // The source may be keyed by anything; only its values carry through.
  _iter: OpSeq<unknown, V>;

  constructor(iter: OpSeq<unknown, V>) {
    super(CONSTRUCT);
    this._iter = iter;
    this.size = iter.size;
  }

  includes(value: V): boolean {
    return this._iter.includes(value);
  }

  __iterate(fn: SideEffect<number, V, this>, reverse?: boolean): number {
    let i = 0;
    reverse && ensureSize(this);
    return this._iter.__iterate(
      v => fn(v, reverse ? (this.size as number) - ++i : i++, this),
      reverse
    );
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<number, V>> {
    const iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    let i = 0;
    reverse && ensureSize(this);
    return new Iterator<IteratorStep<number, V>>(() => {
      const step = iterator.next();
      return step.done
        ? step
        : iteratorValue(
            type,
            reverse ? (this.size as number) - ++i : i++,
            step.value,
            step
          );
    });
  }
}

export class ToSetSequence<V> extends SetSeq<V> {
  // The source may be keyed by anything; only its values carry through.
  _iter: OpSeq<unknown, V>;

  constructor(iter: OpSeq<unknown, V>) {
    super(CONSTRUCT);
    this._iter = iter;
    this.size = iter.size;
  }

  has(key: V): boolean {
    return this._iter.includes(key);
  }

  __iterate(fn: SideEffect<V, V, this>, reverse?: boolean): number {
    return this._iter.__iterate(v => fn(v, v, this), reverse);
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<V, V>> {
    const iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    return new Iterator<IteratorStep<V, V>>(() => {
      const step = iterator.next();
      return step.done
        ? step
        : iteratorValue(type, step.value, step.value, step);
    });
  }
}

// An entry as yielded by a from-entries source at runtime: either a [K, V]
// tuple or an indexed collection holding key at 0 and value at 1.
type EntryLike<K, V> = Entry<K, V> & { get(i: 0): K; get(i: 1): V };

export class FromEntriesSequence<K, V> extends KeyedSeq<K, V> {
  // The source's values are the raw, not-yet-validated entries.
  _iter: OpSeq;

  constructor(entries: OpSeq) {
    super(CONSTRUCT);
    this._iter = entries;
    this.size = entries.size;
  }

  entrySeq(): ISeq.Indexed<[K, V]> {
    return viewCollectionAs<ISeq.Indexed<[K, V]>>(this._iter.toSeq());
  }

  __iterate(fn: SideEffect<K, V, this>, reverse?: boolean): number {
    return this._iter.__iterate(entry => {
      // Check if entry exists first so array access doesn't throw for holes
      // in the parent iteration.
      if (entry) {
        validateEntry(entry);
        const indexedCollection = isCollection(entry);
        const e = entry as EntryLike<K, V>;
        return fn(
          indexedCollection ? e.get(1) : e[1],
          indexedCollection ? e.get(0) : e[0],
          this
        );
      }
      return undefined;
    }, reverse);
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, V>> {
    const iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    return new Iterator<IteratorStep<K, V>>(() => {
      while (true) {
        const step = iterator.next();
        if (step.done) {
          return step;
        }
        const entry = step.value;
        // Check if entry exists first so array access doesn't throw for holes
        // in the parent iteration.
        if (entry) {
          validateEntry(entry);
          const indexedCollection = isCollection(entry);
          const e = entry as EntryLike<K, V>;
          return iteratorValue(
            type,
            indexedCollection ? e.get(0) : e[0],
            indexedCollection ? e.get(1) : e[1],
            step
          );
        }
      }
    });
  }
}

writable(ToIndexedSequence.prototype)['cacheResult'] =
  writable(ToKeyedSequence.prototype)['cacheResult'] =
  writable(ToSetSequence.prototype)['cacheResult'] =
  writable(FromEntriesSequence.prototype)['cacheResult'] =
    cacheResultThrough;

export function flipFactory<K, V>(collection: OpSeq<K, V>): OpSeq<V, K> {
  const flipSequence = makeSequence<V, K>(collection);
  flipSequence._iter = collection;
  flipSequence.size = collection.size;
  flipSequence.flip = () => collection;
  flipSequence.reverse = function (this: OpSeq<V, K>): OpSeq<V, K> {
    // super.reverse() with `this` = the flipped sequence, so keys/values swap.
    const reversedSequence = reparam<OpSeq<V, K>>(
      collection.reverse.apply(this)
    );
    reversedSequence.flip = () => collection.reverse();
    return reversedSequence;
  };
  // A flipped sequence's keys are the source's values and vice versa.
  flipSequence.has = (key: V) => collection.includes(key);
  flipSequence.includes = (key: K) => collection.has(key);
  flipSequence.cacheResult = cacheResultThrough;
  flipSequence.__iterateUncached = function (
    this: OpSeq<V, K>,
    fn: Predicate<V, K>,
    reverse?: boolean
  ) {
    return collection.__iterate((v, k) => fn(k, v, this) !== false, reverse);
  };
  flipSequence.__iteratorUncached = function (
    this: OpSeq<V, K>,
    type: IterateType,
    reverse?: boolean
  ) {
    if (type === ITERATE_ENTRIES) {
      const iterator = collection.__iterator(type, reverse);
      // The source's [K, V] entry cells are swapped IN PLACE to [V, K]; this
      // one-time view re-tags the produced iterator accordingly.
      return reparam<ImmutableIterator<IteratorStep<V, K>>>(
        new Iterator(() => {
          const step = iterator.next();
          if (!step.done) {
            const value = step.value as Entry;
            const k = value[0];
            value[0] = value[1];
            value[1] = k;
          }
          return step;
        })
      );
    }
    // KEYS <-> VALUES swap: the source's keys are this sequence's values and
    // vice versa, hence the re-tagged view.
    return reparam<ImmutableIterator<IteratorStep<V, K>>>(
      collection.__iterator(
        type === ITERATE_VALUES ? ITERATE_KEYS : ITERATE_VALUES,
        reverse
      )
    );
  };
  return flipSequence;
}

export function mapFactory<K, V, M>(
  collection: OpSeq<K, V>,
  mapper: Mapper<K, V, M>,
  context?: ThisArg
): OpSeq<K, M> {
  const mappedSequence = makeSequence<K, M>(collection);
  mappedSequence.size = collection.size;
  mappedSequence.has = (key: K) => collection.has(key);
  mappedSequence.get = (key: K, notSetValue?: unknown) => {
    const v = collection.get(key, NOT_SET);
    return v === NOT_SET
      ? notSetValue
      : mapper.call(context, v as V, key, collection);
  };
  mappedSequence.__iterateUncached = function (
    this: OpSeq<K, M>,
    fn: Predicate<K, M>,
    reverse?: boolean
  ) {
    return collection.__iterate(
      (v, k, c) => fn(mapper.call(context, v, k, c), k, this) !== false,
      reverse
    );
  };
  mappedSequence.__iteratorUncached = function (
    this: OpSeq<K, M>,
    type: IterateType,
    reverse?: boolean
  ) {
    const iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    return new Iterator<IteratorStep<K, M>>(() => {
      const step = iterator.next();
      if (step.done) {
        return step;
      }
      const entry = step.value as Entry<K, V>;
      const key = entry[0];
      return iteratorValue(
        type,
        key,
        mapper.call(context, entry[1], key, collection),
        step
      );
    });
  };
  return mappedSequence;
}

export function reverseFactory<K, V>(
  collection: OpSeq<K, V>,
  useKeys?: boolean
): OpSeq<K, V> {
  const reversedSequence = makeSequence<K, V>(collection);
  reversedSequence._iter = collection;
  reversedSequence.size = collection.size;
  reversedSequence.reverse = () => collection;
  if (collection.flip) {
    reversedSequence.flip = function (): OpSeq<V, K> {
      const flipSequence = flipFactory(collection);
      flipSequence.reverse = () => collection.flip!();
      return flipSequence;
    };
  }
  // Reversed unkeyed access re-derives the source key as a negative offset, so
  // the incoming key is a K only when useKeys is set — otherwise an index.
  reversedSequence.get = (key: K | number, notSetValue?: unknown) =>
    collection.get((useKeys ? key : -1 - (key as number)) as K, notSetValue);
  reversedSequence.has = (key: K | number) =>
    collection.has((useKeys ? key : -1 - (key as number)) as K);
  reversedSequence.includes = (value: V) => collection.includes(value);
  reversedSequence.cacheResult = cacheResultThrough;
  reversedSequence.__iterate = function (
    this: OpSeq<K, V>,
    fn: Predicate<K, V>,
    reverse?: boolean
  ) {
    let i = 0;
    reverse && ensureSize(collection);
    return collection.__iterate(
      // Unkeyed reversal renumbers: the fresh index is this seq's key (K).
      (v, k) =>
        fn(
          v,
          (useKeys ? k : reverse ? (this.size as number) - ++i : i++) as K,
          this
        ),
      !reverse
    );
  };
  reversedSequence.__iterator = (type: IterateType, reverse?: boolean) => {
    let i = 0;
    reverse && ensureSize(collection);
    const iterator = collection.__iterator(ITERATE_ENTRIES, !reverse);
    // Faithful to 5.0.x: the original source read `this.size` in the unkeyed
    // reverse case inside an arrow that captured the module-level `this`
    // (undefined in the shipped bundle), so that path has always thrown a
    // TypeError; published 5.1.9 also throws there (a different TypeError).
    // `noThis` reproduces the exact faulty read — a `.size` access on
    // undefined — so every engine raises its own native TypeError wording,
    // as it did in 5.0.x, rather than a hardcoded message.
    const noThis: Array<{ size: number }> = [];
    return new Iterator(() => {
      const step = iterator.next();
      if (step.done) {
        return step;
      }
      const entry = step.value as Entry;
      return iteratorValue(
        type,
        useKeys ? entry[0] : reverse ? noThis[0]!.size - ++i : i++,
        entry[1],
        step
      );
    });
  };
  return reversedSequence;
}

export function filterFactory<K, V>(
  collection: OpSeq<K, V>,
  predicate: Predicate<K, V>,
  context: ThisArg,
  useKeys?: boolean
): OpSeq<K, V> {
  const filterSequence = makeSequence<K, V>(collection);
  if (useKeys) {
    filterSequence.has = (key: K) => {
      const v = collection.get(key, NOT_SET);
      return (
        v !== NOT_SET && !!predicate.call(context, v as V, key, collection)
      );
    };
    filterSequence.get = (key: K, notSetValue?: unknown) => {
      const v = collection.get(key, NOT_SET);
      return v !== NOT_SET && predicate.call(context, v as V, key, collection)
        ? v
        : notSetValue;
    };
  }
  filterSequence.__iterateUncached = function (
    this: OpSeq<K, V>,
    fn: Predicate<K, V>,
    reverse?: boolean
  ) {
    let iterations = 0;
    collection.__iterate((v, k, c) => {
      if (predicate.call(context, v, k, c)) {
        iterations++;
        return fn(v, (useKeys ? k : iterations - 1) as K, this);
      }
      return undefined;
    }, reverse);
    return iterations;
  };
  filterSequence.__iteratorUncached = function (
    this: OpSeq<K, V>,
    type: IterateType,
    reverse?: boolean
  ) {
    const iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    let iterations = 0;
    return new Iterator(() => {
      while (true) {
        const step = iterator.next();
        if (step.done) {
          return step;
        }
        const entry = step.value as Entry<K, V>;
        const key = entry[0];
        const value = entry[1];
        if (predicate.call(context, value, key, collection)) {
          return iteratorValue(type, useKeys ? key : iterations++, value, step);
        }
      }
    });
  };
  return filterSequence;
}

export function countByFactory<K, V, G>(
  collection: OpSeq<K, V>,
  grouper: Mapper<K, V, G>,
  context?: ThisArg
): Map<G, number> {
  const groups = new Map<G, number>().asMutable();
  collection.__iterate((v, k) => {
    groups.update(grouper.call(context, v, k, collection), 0, a => a + 1);
  });
  return groups.asImmutable();
}

export function groupByFactory<K, V, G>(
  collection: OpSeq<K, V>,
  grouper: Mapper<K, V, G>,
  context?: ThisArg
): Map<G, OpSeq<K, V>> {
  const isKeyedIter = isKeyed(collection);
  // Groups collect a keyed source's entries, an unkeyed source's values.
  const groups = (
    isOrdered(collection)
      ? new OrderedMap<G, Array<V | Entry<K, V>>>()
      : new Map<G, Array<V | Entry<K, V>>>()
  ).asMutable();
  collection.__iterate((v, k) => {
    groups.update(grouper.call(context, v, k, collection), a => {
      const arr = a || [];
      arr.push(isKeyedIter ? [k, v] : v);
      return arr;
    });
  });
  const coerce = collectionClass(collection);
  return (
    groups
      // Each group is rebuilt as a collection of the source's kind, so it
      // carries the source's K/V view.
      .map((arr): OpSeq<K, V> => reify(collection, coerce<K, V>(arr)))
      .asImmutable()
  );
}

export function partitionFactory<K, V>(
  collection: OpSeq<K, V>,
  predicate: Predicate<K, V>,
  context?: ThisArg
): Array<OpSeq<K, V>> {
  const isKeyedIter = isKeyed(collection);
  // Partitions collect a keyed source's entries, an unkeyed source's values.
  const groups: [Array<V | Entry<K, V>>, Array<V | Entry<K, V>>] = [[], []];
  collection.__iterate((v, k) => {
    groups[predicate.call(context, v, k, collection) ? 1 : 0].push(
      isKeyedIter ? [k, v] : v
    );
  });
  const coerce = collectionClass(collection);
  return groups.map(arr => reify(collection, coerce<K, V>(arr)));
}

export function sliceFactory<K, V>(
  collection: OpSeq<K, V>,
  begin?: number,
  end?: number,
  useKeys?: boolean
): OpSeq<K, V> {
  const originalSize = collection.size;

  if (wholeSlice(begin, end, originalSize)) {
    return collection;
  }

  // begin or end can not be resolved if they were provided as negative numbers and
  // this collection's size is unknown. In that case, cache first so there is
  // a known size and these do not resolve to NaN.
  if (
    typeof originalSize === 'undefined' &&
    ((begin as number) < 0 || (end as number) < 0)
  ) {
    return sliceFactory(collection.toSeq().cacheResult!(), begin, end, useKeys);
  }

  const resolvedBegin = resolveBegin(begin, originalSize);
  const resolvedEnd = resolveEnd(end, originalSize);

  // Note: resolvedEnd is undefined when the original sequence's length is
  // unknown and this slice did not supply an end and should contain all
  // elements after resolvedBegin.
  // In that case, resolvedSize will be NaN and sliceSize will remain undefined.
  const resolvedSize = (resolvedEnd ?? NaN) - resolvedBegin;
  let sliceSize: number | undefined;
  if (resolvedSize === resolvedSize) {
    sliceSize = resolvedSize < 0 ? 0 : resolvedSize;
  }

  const sliceSeq = makeSequence<K, V>(collection);

  // If collection.size is undefined, the size of the realized sliceSeq is
  // unknown at this point unless the number of items to slice is 0
  sliceSeq.size =
    sliceSize === 0 ? sliceSize : (collection.size && sliceSize) || undefined;

  if (!useKeys && isSeq(collection) && (sliceSize as number) >= 0) {
    sliceSeq.get = function (
      this: OpSeq,
      index: unknown,
      notSetValue?: unknown
    ) {
      index = wrapIndex(this, index as number);
      return (index as number) >= 0 && (index as number) < (sliceSize as number)
        ? collection.get((index as number) + resolvedBegin, notSetValue)
        : notSetValue;
    };
  }

  sliceSeq.__iterateUncached = function (
    this: OpSeq<K, V>,
    fn: Predicate<K, V>,
    reverse?: boolean
  ) {
    if (sliceSize === 0) {
      return 0;
    }
    if (reverse) {
      return this.cacheResult!().__iterate(fn, reverse);
    }
    let skipped = 0;
    let isSkipping = true;
    let iterations = 0;
    collection.__iterate((v, k) => {
      if (!(isSkipping && (isSkipping = skipped++ < resolvedBegin))) {
        iterations++;
        return (
          fn(v, (useKeys ? k : iterations - 1) as K, this) !== false &&
          iterations !== sliceSize
        );
      }
      return undefined;
    });
    return iterations;
  };

  sliceSeq.__iteratorUncached = function (
    this: OpSeq<K, V>,
    type: IterateType,
    reverse?: boolean
  ) {
    if (sliceSize !== 0 && reverse) {
      return this.cacheResult!().__iterator(type, reverse);
    }
    // Don't bother instantiating parent iterator if taking 0.
    if (sliceSize === 0) {
      return new Iterator(iteratorDone);
    }
    const iterator = collection.__iterator(type, reverse);
    let skipped = 0;
    let iterations = 0;
    return new Iterator(() => {
      while (skipped++ < resolvedBegin) {
        iterator.next();
      }
      if (++iterations > (sliceSize as number)) {
        return iteratorDone();
      }
      const step = iterator.next();
      if (useKeys || type === ITERATE_VALUES || step.done) {
        return step;
      }
      if (type === ITERATE_KEYS) {
        return iteratorValue(type, iterations - 1, undefined, step);
      }
      return iteratorValue(
        type,
        iterations - 1,
        (step.value as Entry)[1],
        step
      );
    });
  };

  return sliceSeq;
}

export function takeWhileFactory<K, V>(
  collection: OpSeq<K, V>,
  predicate: Predicate<K, V>,
  context?: ThisArg
): OpSeq<K, V> {
  const takeSequence = makeSequence<K, V>(collection);
  takeSequence.__iterateUncached = function (
    this: OpSeq<K, V>,
    fn: Predicate<K, V>,
    reverse?: boolean
  ) {
    if (reverse) {
      return this.cacheResult!().__iterate(fn, reverse);
    }
    let iterations = 0;
    collection.__iterate(
      // NOTE: no boolean coercion — the raw `&&` chain is load-bearing. A
      // falsy-but-not-`false` predicate result (0, '', undefined) skips the
      // entry but does NOT abort __iterate (which only stops on `=== false`),
      // matching long-shipped behavior. See __tests__/Seq.ts.
      (v, k, c) =>
        predicate.call(context, v, k, c) && ++iterations && fn(v, k, this)
    );
    return iterations;
  };
  takeSequence.__iteratorUncached = function (
    this: OpSeq<K, V>,
    type: IterateType,
    reverse?: boolean
  ) {
    if (reverse) {
      return this.cacheResult!().__iterator(type, reverse);
    }
    const iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    let iterating = true;
    return new Iterator(() => {
      if (!iterating) {
        return iteratorDone();
      }
      const step = iterator.next();
      if (step.done) {
        return step;
      }
      const entry = step.value as Entry<K, V>;
      const k = entry[0];
      const v = entry[1];
      if (!predicate.call(context, v, k, this)) {
        iterating = false;
        return iteratorDone();
      }
      return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
    });
  };
  return takeSequence;
}

export function skipWhileFactory<K, V>(
  collection: OpSeq<K, V>,
  predicate: Predicate<K, V>,
  context: ThisArg,
  useKeys?: boolean
): OpSeq<K, V> {
  const skipSequence = makeSequence<K, V>(collection);
  skipSequence.__iterateUncached = function (
    this: OpSeq<K, V>,
    fn: Predicate<K, V>,
    reverse?: boolean
  ) {
    if (reverse) {
      return this.cacheResult!().__iterate(fn, reverse);
    }
    let isSkipping = true;
    let iterations = 0;
    collection.__iterate((v, k, c) => {
      if (!(isSkipping && (isSkipping = !!predicate.call(context, v, k, c)))) {
        iterations++;
        return fn(v, (useKeys ? k : iterations - 1) as K, this);
      }
      return undefined;
    });
    return iterations;
  };
  skipSequence.__iteratorUncached = function (
    this: OpSeq<K, V>,
    type: IterateType,
    reverse?: boolean
  ) {
    if (reverse) {
      return this.cacheResult!().__iterator(type, reverse);
    }
    const iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    let skipping = true;
    let iterations = 0;
    return new Iterator<IteratorStep<K, V>>(() => {
      let step;
      let k;
      let v;
      do {
        step = iterator.next();
        if (step.done) {
          if (useKeys || type === ITERATE_VALUES) {
            return step;
          }
          // Faithful to 5.0.x: when the source exhausts while still
          // skipping, the unkeyed KEYS/ENTRIES paths fabricate one final
          // step FROM THE EXHAUSTED CELL (the ENTRIES read of `.value[1]`
          // throws on it, exactly as it always has); the view re-tags the
          // done cell for that quirk.
          const doneCell = reparam<IteratorValueResult<Entry<K, V>>>(step);
          if (type === ITERATE_KEYS) {
            return iteratorValue(type, iterations++, undefined, doneCell);
          }
          return iteratorValue(type, iterations++, doneCell.value[1], doneCell);
        }
        const entry = step.value as Entry<K, V>;
        k = entry[0];
        v = entry[1];
        skipping && (skipping = !!predicate.call(context, v, k, this));
      } while (skipping);
      return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
    });
  };
  return skipSequence;
}

export function concatFactory<K, V>(
  collection: OpSeq<K, V>,
  values: Array<unknown>
): OpSeq {
  const isKeyedCollection = isKeyed(collection);
  const iters = ([collection] as Array<unknown>)
    .concat(values)
    .map(v => {
      if (!isCollection(v)) {
        // `keyedSeqFromValue` is typed with the PUBLIC seq type, which hides
        // the machinery `viewCollectionAs` requires; `viewAs` bridges that.
        return viewAs<OpSeq>(
          isKeyedCollection
            ? keyedSeqFromValue(v)
            : indexedSeqFromValue(Array.isArray(v) ? v : [v])
        );
      }
      if (isKeyedCollection) {
        return viewCollectionAs<OpSeq>(new KeyedCollection(v));
      }
      // The guard narrowed `v` to the PUBLIC collection type — same seam.
      return viewAs<OpSeq>(v);
    })
    .filter(v => v.size !== 0);

  if (iters.length === 0) {
    return collection;
  }

  if (iters.length === 1) {
    const singleton = iters[0]!;
    if (
      singleton === collection ||
      (isKeyedCollection && isKeyed(singleton)) ||
      (isIndexed(collection) && isIndexed(singleton))
    ) {
      return singleton;
    }
  }

  let concatSeq: OpSeq = viewCollectionAs<OpSeq>(new ArraySeq(iters));
  if (isKeyedCollection) {
    concatSeq = concatSeq.toKeyedSeq();
  } else if (!isIndexed(collection)) {
    concatSeq = concatSeq.toSetSeq();
  }
  concatSeq = concatSeq.flatten(true);
  concatSeq.size = iters.reduce((sum: number | undefined, seq) => {
    if (sum !== undefined) {
      const size = seq.size;
      if (size !== undefined) {
        return sum + size;
      }
    }
    return undefined;
  }, 0);
  return concatSeq;
}

export function flattenFactory(
  collection: OpSeq,
  depth: number | boolean | undefined,
  useKeys?: boolean
): OpSeq {
  const flatSequence = makeSequence(collection);
  flatSequence.__iterateUncached = function (
    this: OpSeq,
    fn: Predicate,
    reverse?: boolean
  ) {
    if (reverse) {
      return this.cacheResult!().__iterate(fn, reverse);
    }
    let iterations = 0;
    let stopped = false;
    function flatDeep(iter: OpSeq, currentDepth: number): void {
      iter.__iterate((v, k) => {
        if ((!depth || currentDepth < (depth as number)) && isCollection(v)) {
          flatDeep(viewAs<OpSeq>(v), currentDepth + 1);
        } else {
          iterations++;
          if (fn(v, useKeys ? k : iterations - 1, flatSequence) === false) {
            stopped = true;
          }
        }
        return !stopped;
      }, reverse);
    }
    flatDeep(collection, 0);
    return iterations;
  };
  flatSequence.__iteratorUncached = function (
    this: OpSeq,
    type: IterateType,
    reverse?: boolean
  ) {
    if (reverse) {
      return this.cacheResult!().__iterator(type, reverse);
    }
    let iterator:
      | ImmutableIterator<IteratorStep<unknown, unknown>>
      | undefined = collection.__iterator(type, reverse);
    const stack: Array<ImmutableIterator<IteratorStep<unknown, unknown>>> = [];
    let iterations = 0;
    return new Iterator(() => {
      while (iterator) {
        const step = iterator.next();
        if (step.done !== false) {
          iterator = stack.pop();
          continue;
        }
        let v = step.value;
        if (type === ITERATE_ENTRIES) {
          v = (v as Entry)[1];
        }
        if ((!depth || stack.length < (depth as number)) && isCollection(v)) {
          stack.push(iterator);
          iterator = viewAs<OpSeq>(v).__iterator(type, reverse);
        } else {
          return useKeys ? step : iteratorValue(type, iterations++, v, step);
        }
      }
      return iteratorDone();
    });
  };
  return flatSequence;
}

export function flatMapFactory<K, V>(
  collection: OpSeq<K, V>,
  mapper: Mapper<K, V>,
  context?: ThisArg
): OpSeq {
  const coerce = collectionClass(collection);
  return collection
    .toSeq()
    .map((v, k) => coerce(mapper.call(context, v, k, collection)))
    .flatten(true);
}

export function interposeFactory<V>(
  collection: OpSeq<unknown, V>,
  separator: V
): OpSeq<number, V> {
  const interposedSequence = makeSequence<number, V>(collection);
  interposedSequence.size = collection.size && collection.size * 2 - 1;
  interposedSequence.__iterateUncached = function (
    this: OpSeq<number, V>,
    fn: Predicate<number, V>,
    reverse?: boolean
  ) {
    let iterations = 0;
    collection.__iterate(
      v =>
        (!iterations || fn(separator, iterations++, this) !== false) &&
        fn(v, iterations++, this) !== false,
      reverse
    );
    return iterations;
  };
  interposedSequence.__iteratorUncached = function (
    this: OpSeq<number, V>,
    type: IterateType,
    reverse?: boolean
  ) {
    const iterator = collection.__iterator(ITERATE_VALUES, reverse);
    let iterations = 0;
    // Holds only non-done cells: the done result returns early below.
    let step: IteratorValueResult<IteratorStep<unknown, V>> | undefined;
    return new Iterator<IteratorStep<number, V>>(() => {
      if (!step || iterations % 2) {
        const nextStep = iterator.next();
        if (nextStep.done) {
          return nextStep;
        }
        step = nextStep;
      }
      return iterations % 2
        ? iteratorValue(type, iterations++, separator)
        : iteratorValue(type, iterations++, step.value, step);
    });
  };
  return interposedSequence;
}

// A decorated sort entry: [key, value, original index, comparison value]. The
// comparison value is the mapper's result — or the value itself when no
// mapper is given.
type SortEntry<K, V, M> = [K, V, number, M | V];

/**
 * The minimal surface `sortFactory` needs from its source. Declared
 * structurally so BOTH the internal OpSeq view and the concrete collection
 * classes (whose public types hide the internal machinery) satisfy it
 * directly — class callers need no reinterpretation.
 */
export interface Sortable<K, V> {
  toSeq(): {
    map<M>(mapper: (value: V, key: K) => M): {
      valueSeq(): { toArray(): Array<M> };
    };
  };
}

// Overloaded so call sites keep their precise callback types: without a
// mapper the comparator sees values (V); with one it sees the mapper's
// results (M). `S` ties the mapper's `iter` param to the caller's own type
// (class methods pass `this` and declare `iter: this`).
export function sortFactory<K, V, S extends Sortable<K, V>>(
  collection: S,
  comparator?: Comparator<V>,
  mapper?: undefined
): OpSeq<K, V>;
export function sortFactory<K, V, M, S extends Sortable<K, V>>(
  collection: S,
  comparator: Comparator<M> | undefined,
  mapper: (value: V, key: K, iter: S) => M
): OpSeq<K, V>;
export function sortFactory<K, V, M>(
  collection: Sortable<K, V>,
  comparator?: Comparator<M | V>,
  mapper?: (value: V, key: K, iter: Sortable<K, V>) => M
): OpSeq<K, V> {
  const cmp = comparator || defaultComparator;
  const isKeyedCollection = isKeyed(collection);
  let index = 0;
  const entries = collection
    .toSeq()
    .map(
      (v, k): SortEntry<K, V, M> => [
        k,
        v,
        index++,
        mapper ? mapper(v, k, collection) : v,
      ]
    )
    .valueSeq()
    .toArray();
  entries
    .sort((a, b) => cmp(a[3], b[3]) || a[2] - b[2])
    .forEach(
      // The decorated entries are undecorated IN PLACE, truncating each to a
      // [key, value] pair (keyed) or replacing it with its value (unkeyed);
      // the writable views below express that re-shaping.
      isKeyedCollection
        ? (_v, i) => {
            reparam<{ length: number }>(entries[i]!).length = 2;
          }
        : (v, i) => {
            reparam<Array<V>>(entries)[i] = v[1];
          }
    );
  return isKeyedCollection
    ? viewCollectionAs<OpSeq<K, V>>(new KeyedSeq(entries))
    : isIndexed(collection)
    ? viewCollectionAs<OpSeq<K, V>>(new IndexedSeq(entries))
    : viewCollectionAs<OpSeq<K, V>>(new SetSeq(entries));
}

export function maxFactory<K, V, M>(
  collection: OpSeq<K, V>,
  comparator?: Comparator,
  mapper?: Mapper<K, V, M>
): V | undefined {
  const cmp = comparator || defaultComparator;
  if (mapper) {
    const entry = collection
      .toSeq()
      .map((v, k): Entry<V, M> => [v, mapper(v, k, collection)])
      .reduce<Entry<V, M>>((a, b) => (maxCompare(cmp, a[1], b[1]) ? b : a));
    return entry && entry[0];
  }
  return collection.reduce((a, b) => (maxCompare(cmp, a, b) ? b : a));
}

function maxCompare(comparator: Comparator, a: unknown, b: unknown): boolean {
  const comp = comparator(b, a);
  // b is considered the new max if the comparator declares them equal, but
  // they are not equal and b is in fact a nullish value.
  return (
    (comp === 0 && b !== a && (b === undefined || b === null || b !== b)) ||
    comp > 0
  );
}

export function zipWithFactory(
  keyIter: OpSeq,
  zipper: (...values: Array<unknown>) => unknown,
  // Raw user arguments: plain arrays, iterables, even primitives. Each is
  // coerced (`new Collection(i)`) before iteration; the size probe below
  // reads `.size` off the RAW value — faithful to 5.0.x, where a plain
  // array's absent `size` reads as `undefined` (and `null` throws).
  iters: Array<unknown>,
  zipAll?: boolean
): OpSeq {
  const zipSequence = makeSequence(keyIter);
  const sizes = new ArraySeq(iters).map(
    i => (i as { size?: number | undefined }).size
  );
  zipSequence.size = zipAll ? sizes.max() : sizes.min();
  // Note: this is a generic base implementation of __iterate in terms of
  // __iterator which may be more generically useful in the future.
  zipSequence.__iterate = function (
    this: OpSeq,
    fn: Predicate,
    reverse?: boolean
  ) {
    // indexed:
    const iterator = this.__iterator(ITERATE_VALUES, reverse);
    let step;
    let iterations = 0;
    while (!(step = iterator.next()).done) {
      if (fn(step.value, iterations++, this) === false) {
        break;
      }
    }
    return iterations;
  };
  zipSequence.__iteratorUncached = function (
    this: OpSeq,
    type: IterateType,
    reverse?: boolean
  ) {
    const iterators = iters.map(i => {
      const coerced = viewCollectionAs<OpSeq>(new Collection(i));
      // Non-null: every collection prototype gets ITERATOR_SYMBOL attached
      // by the load-time mixin wiring, so getIterator always finds one here.
      return getIterator(reverse ? coerced.reverse() : coerced)!;
    });
    let iterations = 0;
    let isDone = false;
    return new Iterator(() => {
      let steps: Array<ImmIteratorResult<unknown>>;
      if (!isDone) {
        steps = iterators.map(i => i.next());
        isDone = zipAll ? steps.every(s => s.done) : steps.some(s => s.done);
      } else {
        steps = [];
      }
      if (isDone) {
        return iteratorDone();
      }
      return iteratorValue(
        type,
        iterations++,
        zipper.apply(
          null,
          steps.map(s => s.value)
        )
      );
    });
  };
  return zipSequence;
}

// #pragma Helper Functions

export function reify<RK, RV>(iter: OpSeq, seq: OpSeq<RK, RV>): OpSeq<RK, RV> {
  return iter === seq
    ? seq
    : isSeq(iter)
    ? seq
    : // The coercion factory rebuilds a concrete collection of `iter`'s kind
      // holding `seq`'s entries, so it carries the same K/V view.
      iter.constructor<RK, RV>(seq);
}

function validateEntry(entry: unknown): void {
  if (entry !== Object(entry)) {
    throw new TypeError('Expected [K, V] tuple: ' + entry);
  }
}

// A collection's coercion factory viewed as a plain function: accepts any raw
// input and constructs a collection carrying whatever K/V view its input had
// (kind/type erasure is claimed here, once, instead of at every call site).
type CoerceFn = <CK, CV>(value?: unknown) => OpSeq<CK, CV>;

function collectionClass(collection: OpSeq): CoerceFn {
  return isKeyed(collection)
    ? callableAs<CoerceFn>(KeyedCollection)
    : isIndexed(collection)
    ? callableAs<CoerceFn>(IndexedCollection)
    : callableAs<CoerceFn>(SetCollection);
}

function makeSequence<SK, SV>(collection: OpSeq): OpSeq<SK, SV> {
  return Object.create(
    (isKeyed(collection)
      ? KeyedSeq
      : isIndexed(collection)
      ? IndexedSeq
      : SetSeq
    ).prototype
  );
}

// The receiver intersection states the install-site invariant: this function
// is only ever installed on wrapper seqs whose factory/constructor sets
// `_iter` (ToKeyed/ToIndexed/ToSet/FromEntries, flip, reverse).
function cacheResultThrough<K, V>(
  this: OpSeq<K, V> & { _iter: OpSeq }
): OpSeq<K, V> {
  if (this._iter.cacheResult) {
    this._iter.cacheResult();
    this.size = this._iter.size;
    return this;
  }
  return callableAs<(this: OpSeq) => OpSeq<K, V>>(
    Seq.prototype.cacheResult
  ).call(this);
}

function defaultComparator(a: unknown, b: unknown): number {
  if (a === undefined && b === undefined) {
    return 0;
  }

  if (a === undefined) {
    return 1;
  }

  if (b === undefined) {
    return -1;
  }

  return (a as number) > (b as number)
    ? 1
    : (a as number) < (b as number)
    ? -1
    : 0;
}
