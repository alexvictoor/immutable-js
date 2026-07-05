import {
  Collection,
  KeyedCollection,
  IndexedCollection,
  SetCollection,
} from './Collection';
import { IS_COLLECTION_SYMBOL } from './predicates/isCollection';
import { isKeyed, IS_KEYED_SYMBOL } from './predicates/isKeyed';
import { isIndexed, IS_INDEXED_SYMBOL } from './predicates/isIndexed';
import { isOrdered, IS_ORDERED_SYMBOL } from './predicates/isOrdered';
import { is } from './is';
import {
  NOT_SET,
  ensureSize,
  wrapIndex,
  returnTrue,
  resolveBegin,
} from './TrieUtils';
import { hash } from './Hash';
import { imul, smi } from './Math';
import {
  Iterator,
  ITERATOR_SYMBOL,
  ITERATE_KEYS,
  ITERATE_VALUES,
  ITERATE_ENTRIES,
} from './Iterator';

import arrCopy from './utils/arrCopy';
import assertNotInfinite from './utils/assertNotInfinite';
import deepEqual from './utils/deepEqual';
import mixin from './utils/mixin';
import quoteString from './utils/quoteString';

import { toJS } from './toJS';
import { Map } from './Map';
import { OrderedMap } from './OrderedMap';
import { List } from './List';
import { Set } from './Set';
import { OrderedSet } from './OrderedSet';
import { Stack } from './Stack';
import { Range } from './Range';
import { KeyedSeq, IndexedSeq, SetSeq, ArraySeq } from './Seq';
import {
  reify,
  ToKeyedSequence,
  ToIndexedSequence,
  ToSetSequence,
  FromEntriesSequence,
  flipFactory,
  mapFactory,
  reverseFactory,
  filterFactory,
  countByFactory,
  groupByFactory,
  sliceFactory,
  takeWhileFactory,
  skipWhileFactory,
  concatFactory,
  flattenFactory,
  flatMapFactory,
  interposeFactory,
  sortFactory,
  maxFactory,
  zipWithFactory,
  partitionFactory,
} from './Operations';
import type {
  OpSeq,
  Predicate,
  Mapper,
  Comparator,
  ThisArg,
} from './Operations';
import { viewAs, viewCollectionAs, writable } from './utils/reinterpret';
import { getIn } from './methods/getIn';
import { hasIn } from './methods/hasIn';
import { toObject } from './methods/toObject';
import type { ImmutableIterator, IteratorStep } from './internalTypes';
import type { Collection as ICollection } from '../type-definitions/immutable';

export { Collection, CollectionPrototype, IndexedCollectionPrototype };

// Key-level conformance check for the mixin literals below: annotating each
// literal `const xMixin: MixinKeys<…>` triggers excess-property checking, so
// a misspelled key — or a member attached without being declared on the
// public interface or the internal `this` view — is a compile error. Values
// are deliberately `unknown` — signature conformance would fight the
// method-syntax bivariance design (see OpSeq's NOTE) — so this checks
// presence, not shape. (Annotated consts rather than `satisfies` only
// because the pinned prettier predates that keyword.)
type MixinKeys<T> = Partial<Record<keyof T, unknown>>;

// The `this` surface shared by the mixin method bodies below: the generic
// lazy-seq API plus the members those bodies rely on. Each mixin method binds
// K/V through an explicit generic `this` parameter.
interface CollectionThis<K = unknown, V = unknown> extends OpSeq<K, V> {
  toString(): string;
  get<NSV = undefined>(key: K, notSetValue?: NSV): V | NSV;
  has(key: K): boolean;
  includes(value: V): boolean;
  entries(): ImmutableIterator<[K, V]>;
  skipWhile(predicate: Predicate<K, V>, context?: ThisArg): OpSeq<K, V>;
  takeWhile(predicate: Predicate<K, V>, context?: ThisArg): OpSeq<K, V>;
  __hash?: number | undefined;
  _cache?: Array<[K, V]> | undefined;
  __toStringMapper?: (v: V, k: K) => string;
  __toString(head: string, tail: string): string;
}

Collection.Iterator = Iterator;

const collectionMixin: MixinKeys<
  ICollection<unknown, unknown> & CollectionThis
> = {
  // ### Conversion to other types

  toArray<K, V>(this: CollectionThis<K, V>): Array<V | [K, V]> {
    assertNotInfinite(this.size);
    const array = new Array(this.size || 0);
    const useTuples = isKeyed(this);
    let i = 0;
    this.__iterate((v, k) => {
      // Keyed collections produce an array of tuples.
      array[i++] = useTuples ? [k, v] : v;
    });
    return array;
  },

  toIndexedSeq<K, V>(this: CollectionThis<K, V>): OpSeq<number, V> {
    return viewCollectionAs<OpSeq<number, V>>(new ToIndexedSequence(this));
  },

  toJS(this: CollectionThis): unknown {
    return toJS(this);
  },

  toKeyedSeq<K, V>(this: CollectionThis<K, V>): OpSeq<K, V> {
    return viewCollectionAs<OpSeq<K, V>>(new ToKeyedSequence(this, true));
  },

  toMap<K, V>(this: CollectionThis<K, V>): Map<K, V> {
    // Use Late Binding here to solve the circular dependency.
    return new Map<K, V>(this.toKeyedSeq());
  },

  toObject: toObject,

  toOrderedMap<K, V>(this: CollectionThis<K, V>): OrderedMap<K, V> {
    // Use Late Binding here to solve the circular dependency.
    return new OrderedMap<K, V>(this.toKeyedSeq());
  },

  toOrderedSet<K, V>(this: CollectionThis<K, V>): OrderedSet<V> {
    // Use Late Binding here to solve the circular dependency.
    return new OrderedSet<V>(isKeyed(this) ? this.valueSeq() : this);
  },

  toSet<K, V>(this: CollectionThis<K, V>): Set<V> {
    // Use Late Binding here to solve the circular dependency.
    return new Set<V>(isKeyed(this) ? this.valueSeq() : this);
  },

  toSetSeq<K, V>(this: CollectionThis<K, V>): OpSeq<V, V> {
    return viewCollectionAs<OpSeq<V, V>>(new ToSetSequence(this));
  },

  toSeq(this: CollectionThis): OpSeq {
    return isIndexed(this)
      ? this.toIndexedSeq()
      : isKeyed(this)
      ? this.toKeyedSeq()
      : this.toSetSeq();
  },

  toStack<K, V>(this: CollectionThis<K, V>): Stack<V> {
    // Use Late Binding here to solve the circular dependency.
    return new Stack<V>(isKeyed(this) ? this.valueSeq() : this);
  },

  toList<K, V>(this: CollectionThis<K, V>): List<V> {
    // Use Late Binding here to solve the circular dependency.
    return new List<V>(isKeyed(this) ? this.valueSeq() : this);
  },

  // ### Common JavaScript methods and properties

  toString(this: CollectionThis): string {
    return '[Collection]';
  },

  __toString(this: CollectionThis, head: string, tail: string): string {
    if (this.size === 0) {
      return head + tail;
    }
    return (
      head +
      ' ' +
      this.toSeq().map(this.__toStringMapper!).join(', ') +
      ' ' +
      tail
    );
  },

  // ### ES6 Collection methods (ES6 Array and Map)

  concat<K, V>(this: CollectionThis<K, V>, ...values: Array<unknown>): OpSeq {
    return reify(this, concatFactory(this, values));
  },

  includes<K, V>(this: CollectionThis<K, V>, searchValue: V): boolean {
    return this.some(value => is(value, searchValue));
  },

  entries<K, V>(
    this: CollectionThis<K, V>
  ): ImmutableIterator<IteratorStep<K, V>> {
    return this.__iterator(ITERATE_ENTRIES);
  },

  every<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): boolean {
    assertNotInfinite(this.size);
    let returnValue = true;
    this.__iterate((v, k, c) => {
      if (!predicate.call(context, v, k, c)) {
        returnValue = false;
        return false;
      }
      return undefined;
    });
    return returnValue;
  },

  filter<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): OpSeq<K, V> {
    return reify(this, filterFactory(this, predicate, context, true));
  },

  partition<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): Array<OpSeq<K, V>> {
    return partitionFactory(this, predicate, context);
  },

  find<K, V, NSV>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): V | NSV | undefined {
    const entry = this.findEntry(predicate, context);
    return entry ? entry[1] : notSetValue;
  },

  forEach<K, V>(
    this: CollectionThis<K, V>,
    sideEffect: Predicate<K, V>,
    context?: ThisArg
  ): number {
    assertNotInfinite(this.size);
    return this.__iterate(
      context ? (sideEffect.bind(context) as Predicate<K, V>) : sideEffect
    );
  },

  join<K, V>(this: CollectionThis<K, V>, separator?: string): string {
    assertNotInfinite(this.size);
    const sep = separator !== undefined ? '' + separator : ',';
    let joined = '';
    let isFirst = true;
    this.__iterate(v => {
      isFirst ? (isFirst = false) : (joined += sep);
      joined +=
        v !== null && v !== undefined
          ? (v as { toString(): string }).toString()
          : '';
    });
    return joined;
  },

  keys<K, V>(
    this: CollectionThis<K, V>
  ): ImmutableIterator<IteratorStep<K, V>> {
    return this.__iterator(ITERATE_KEYS);
  },

  map<K, V, M>(
    this: CollectionThis<K, V>,
    mapper: Mapper<K, V, M>,
    context?: ThisArg
  ): OpSeq<K, M> {
    return reify(this, mapFactory(this, mapper, context));
  },

  reduce<K, V, R>(
    this: CollectionThis<K, V>,
    reducer: (reduction: R, value: V, key: K, iter: object) => R,
    initialReduction?: R,
    context?: ThisArg
  ): R {
    // eslint-disable-next-line prefer-rest-params
    return reduce(
      this,
      reducer,
      initialReduction,
      context,
      arguments.length < 2,
      false
    );
  },

  reduceRight<K, V, R>(
    this: CollectionThis<K, V>,
    reducer: (reduction: R, value: V, key: K, iter: object) => R,
    initialReduction?: R,
    context?: ThisArg
  ): R {
    // eslint-disable-next-line prefer-rest-params
    return reduce(
      this,
      reducer,
      initialReduction,
      context,
      arguments.length < 2,
      true
    );
  },

  reverse<K, V>(this: CollectionThis<K, V>): OpSeq<K, V> {
    return reify(this, reverseFactory(this, true));
  },

  slice<K, V>(
    this: CollectionThis<K, V>,
    begin?: number,
    end?: number
  ): OpSeq<K, V> {
    return reify(this, sliceFactory(this, begin, end, true));
  },

  some<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): boolean {
    assertNotInfinite(this.size);
    let returnValue = false;
    this.__iterate((v, k, c) => {
      if (predicate.call(context, v, k, c)) {
        returnValue = true;
        return false;
      }
      return undefined;
    });
    return returnValue;
  },

  sort<K, V>(
    this: CollectionThis<K, V>,
    comparator?: Comparator<V>
  ): OpSeq<K, V> {
    return reify(this, sortFactory(this, comparator, undefined));
  },

  values<K, V>(
    this: CollectionThis<K, V>
  ): ImmutableIterator<IteratorStep<K, V>> {
    return this.__iterator(ITERATE_VALUES);
  },

  // ### More sequential methods

  butLast<K, V>(this: CollectionThis<K, V>): OpSeq<K, V> {
    return this.slice(0, -1);
  },

  isEmpty(this: CollectionThis): boolean {
    return this.size !== undefined ? this.size === 0 : !this.some(() => true);
  },

  count<K, V>(
    this: CollectionThis<K, V>,
    predicate?: Predicate<K, V>,
    context?: ThisArg
  ): number {
    return ensureSize(
      predicate ? this.toSeq().filter(predicate, context) : this
    );
  },

  countBy<K, V, G>(
    this: CollectionThis<K, V>,
    grouper: Mapper<K, V, G>,
    context?: ThisArg
  ): Map<G, number> {
    return countByFactory(this, grouper, context);
  },

  equals(this: CollectionThis, other: unknown): boolean {
    return deepEqual(this, other);
  },

  entrySeq<K, V>(this: CollectionThis<K, V>): OpSeq<number, [K, V]> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const collection = this;
    if (collection._cache) {
      // We cache as an entries array, so we can just return the cache!
      return viewCollectionAs<OpSeq<number, [K, V]>>(
        new ArraySeq(collection._cache)
      );
    }
    const entriesSequence = collection.toSeq().map(entryMapper).toIndexedSeq();
    entriesSequence.fromEntrySeq = () => collection.toSeq();
    return entriesSequence;
  },

  filterNot<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): OpSeq<K, V> {
    return this.filter(not(predicate), context);
  },

  findEntry<K, V, NSV>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): [K, V] | NSV | undefined {
    let found: [K, V] | NSV | undefined = notSetValue;
    this.__iterate((v, k, c) => {
      if (predicate.call(context, v, k, c)) {
        found = [k, v];
        return false;
      }
      return undefined;
    });
    return found;
  },

  findKey<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): K | undefined {
    const entry = this.findEntry(predicate, context);
    return entry && entry[0];
  },

  findLast<K, V, NSV>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): V | NSV {
    return this.toKeyedSeq().reverse().find(predicate, context, notSetValue);
  },

  findLastEntry<K, V, NSV>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg,
    notSetValue?: NSV
  ): [K, V] | NSV {
    return this.toKeyedSeq()
      .reverse()
      .findEntry(predicate, context, notSetValue);
  },

  findLastKey<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): K | undefined {
    return this.toKeyedSeq().reverse().findKey(predicate, context);
  },

  first<K, V, NSV>(this: CollectionThis<K, V>, notSetValue?: NSV): V | NSV {
    return this.find(returnTrue, null, notSetValue) as V | NSV;
  },

  flatMap<K, V>(
    this: CollectionThis<K, V>,
    mapper: Mapper<K, V>,
    context?: ThisArg
  ): OpSeq {
    return reify(this, flatMapFactory(this, mapper, context));
  },

  flatten<K, V>(this: CollectionThis<K, V>, depth?: number | boolean): OpSeq {
    return reify(this, flattenFactory(this, depth, true));
  },

  fromEntrySeq(this: CollectionThis): OpSeq {
    return viewCollectionAs<OpSeq>(new FromEntriesSequence(this));
  },

  get<K, V, NSV>(
    this: CollectionThis<K, V>,
    searchKey: K,
    notSetValue?: NSV
  ): V | NSV | undefined {
    return this.find((_, key) => is(key, searchKey), undefined, notSetValue);
  },

  getIn: getIn,

  groupBy<K, V, G>(
    this: CollectionThis<K, V>,
    grouper: Mapper<K, V, G>,
    context?: ThisArg
  ): Map<G, OpSeq<K, V>> {
    return groupByFactory(this, grouper, context);
  },

  has<K, V>(this: CollectionThis<K, V>, searchKey: K): boolean {
    return this.get(searchKey, NOT_SET) !== NOT_SET;
  },

  hasIn: hasIn,

  isSubset<K, V>(this: CollectionThis<K, V>, iter: Iterable<V>): boolean {
    const other = viewAs<{ includes(value: V): boolean }>(
      typeof (iter as { includes?: unknown }).includes === 'function'
        ? iter
        : new Collection(iter)
    );
    return this.every(value => other.includes(value));
  },

  isSuperset<K, V>(this: CollectionThis<K, V>, iter: Iterable<V>): boolean {
    const other = viewAs<{ isSubset(c: object): boolean }>(
      typeof (iter as { isSubset?: unknown }).isSubset === 'function'
        ? iter
        : new Collection(iter)
    );
    return other.isSubset(this);
  },

  keyOf<K, V>(this: CollectionThis<K, V>, searchValue: V): K | undefined {
    return this.findKey(value => is(value, searchValue));
  },

  keySeq<K, V>(this: CollectionThis<K, V>): OpSeq<number, K> {
    return this.toSeq().map(keyMapper).toIndexedSeq();
  },

  last<K, V, NSV>(this: CollectionThis<K, V>, notSetValue?: NSV): V | NSV {
    return this.toSeq().reverse().first(notSetValue);
  },

  lastKeyOf<K, V>(this: CollectionThis<K, V>, searchValue: V): K | undefined {
    return this.toKeyedSeq().reverse().keyOf(searchValue);
  },

  max<K, V>(
    this: CollectionThis<K, V>,
    comparator?: Comparator
  ): V | undefined {
    return maxFactory(this, comparator, undefined);
  },

  maxBy<K, V>(
    this: CollectionThis<K, V>,
    mapper: Mapper<K, V>,
    comparator?: Comparator
  ): V | undefined {
    return maxFactory(this, comparator, mapper);
  },

  min<K, V>(
    this: CollectionThis<K, V>,
    comparator?: Comparator
  ): V | undefined {
    return maxFactory(
      this,
      comparator ? neg(comparator) : defaultNegComparator,
      undefined
    );
  },

  minBy<K, V>(
    this: CollectionThis<K, V>,
    mapper: Mapper<K, V>,
    comparator?: Comparator
  ): V | undefined {
    return maxFactory(
      this,
      comparator ? neg(comparator) : defaultNegComparator,
      mapper
    );
  },

  rest<K, V>(this: CollectionThis<K, V>): OpSeq<K, V> {
    return this.slice(1);
  },

  skip<K, V>(this: CollectionThis<K, V>, amount: number): OpSeq<K, V> {
    return amount === 0 ? this : this.slice(Math.max(0, amount));
  },

  skipLast<K, V>(this: CollectionThis<K, V>, amount: number): OpSeq<K, V> {
    return amount === 0 ? this : this.slice(0, -Math.max(0, amount));
  },

  skipWhile<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): OpSeq<K, V> {
    return reify(this, skipWhileFactory(this, predicate, context, true));
  },

  skipUntil<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): OpSeq<K, V> {
    return this.skipWhile(not(predicate), context);
  },

  sortBy<K, V, M>(
    this: CollectionThis<K, V>,
    mapper: Mapper<K, V, M>,
    comparator?: Comparator<M>
  ): OpSeq<K, V> {
    return reify(this, sortFactory(this, comparator, mapper));
  },

  take<K, V>(this: CollectionThis<K, V>, amount: number): OpSeq<K, V> {
    return this.slice(0, Math.max(0, amount));
  },

  takeLast<K, V>(this: CollectionThis<K, V>, amount: number): OpSeq<K, V> {
    return this.slice(-Math.max(0, amount));
  },

  takeWhile<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): OpSeq<K, V> {
    return reify(this, takeWhileFactory(this, predicate, context));
  },

  takeUntil<K, V>(
    this: CollectionThis<K, V>,
    predicate: Predicate<K, V>,
    context?: ThisArg
  ): OpSeq<K, V> {
    return this.takeWhile(not(predicate), context);
  },

  update<K, V, R>(
    this: CollectionThis<K, V>,
    fn: (value: CollectionThis<K, V>) => R
  ): R {
    return fn(this);
  },

  valueSeq<K, V>(this: CollectionThis<K, V>): OpSeq<number, V> {
    return this.toIndexedSeq();
  },

  // ### Hashable Object

  hashCode(this: CollectionThis): number {
    return this.__hash || (this.__hash = hashCollection(this));
  },

  // ### Internal

  // abstract __iterate(fn, reverse)

  // abstract __iterator(type, reverse)
};
mixin(Collection, collectionMixin);

const CollectionPrototype = Collection.prototype;
const collProto = writable(CollectionPrototype);
collProto[IS_COLLECTION_SYMBOL] = true;
collProto[ITERATOR_SYMBOL] = collProto['values'];
collProto['toJSON'] = collProto['toArray'];
collProto['__toStringMapper'] = quoteString;
collProto['inspect'] = collProto['toSource'] = function (this: CollectionThis) {
  return this.toString();
};
collProto['chain'] = collProto['flatMap'];
collProto['contains'] = collProto['includes'];

const keyedCollectionMixin: MixinKeys<
  ICollection.Keyed<unknown, unknown> & CollectionThis
> = {
  // ### More sequential methods

  flip<K, V>(this: CollectionThis<K, V>): OpSeq<V, K> {
    return reify(this, flipFactory(this));
  },

  mapEntries<K, V, KM, VM>(
    this: CollectionThis<K, V>,
    mapper: (entry: [K, V], index: number, iter: object) => [KM, VM],
    context?: ThisArg
  ): OpSeq {
    let iterations = 0;
    return reify(
      this,
      this.toSeq()
        .map((v, k) => mapper.call(context, [k, v], iterations++, this))
        .fromEntrySeq()
    );
  },

  mapKeys<K, V, KM>(
    this: CollectionThis<K, V>,
    mapper: (key: K, value: V, iter: object) => KM,
    context?: ThisArg
  ): OpSeq<KM, V> {
    return reify(
      this,
      this.toSeq().flip!().map((k, v) => mapper.call(context, k, v, this))
        .flip!()
    );
  },
};
mixin(KeyedCollection, keyedCollectionMixin);

const KeyedCollectionPrototype = KeyedCollection.prototype;
const keyedProto = writable(KeyedCollectionPrototype);
keyedProto[IS_KEYED_SYMBOL] = true;
keyedProto[ITERATOR_SYMBOL] = collProto['entries'];
keyedProto['toJSON'] = toObject;
keyedProto['__toStringMapper'] = (v: unknown, k: unknown) =>
  quoteString(k) + ': ' + quoteString(v);

const indexedCollectionMixin: MixinKeys<
  ICollection.Indexed<unknown> & CollectionThis
> = {
  // ### Conversion to other types

  toKeyedSeq<V>(this: CollectionThis<number, V>): OpSeq<number, V> {
    return viewCollectionAs<OpSeq<number, V>>(new ToKeyedSequence(this, false));
  },

  // ### ES6 Collection methods (ES6 Array and Map)

  filter<V>(
    this: CollectionThis<number, V>,
    predicate: Predicate<number, V>,
    context?: ThisArg
  ): OpSeq<number, V> {
    return reify(this, filterFactory(this, predicate, context, false));
  },

  findIndex<V>(
    this: CollectionThis<number, V>,
    predicate: Predicate<number, V>,
    context?: ThisArg
  ): number {
    const entry = this.findEntry(predicate, context);
    return entry ? entry[0] : -1;
  },

  indexOf<V>(this: CollectionThis<number, V>, searchValue: V): number {
    const key = this.keyOf(searchValue);
    return key === undefined ? -1 : key;
  },

  lastIndexOf<V>(this: CollectionThis<number, V>, searchValue: V): number {
    const key = this.lastKeyOf(searchValue);
    return key === undefined ? -1 : key;
  },

  reverse<V>(this: CollectionThis<number, V>): OpSeq<number, V> {
    return reify(this, reverseFactory(this, false));
  },

  slice<V>(
    this: CollectionThis<number, V>,
    begin?: number,
    end?: number
  ): OpSeq<number, V> {
    return reify(this, sliceFactory(this, begin, end, false));
  },

  // The spliced-in values are arbitrary, so the result's value type widens.
  splice<V>(
    this: CollectionThis<number, V>,
    index: number,
    removeNum: number
  ): OpSeq {
    // eslint-disable-next-line prefer-rest-params
    const args = arguments;
    const numArgs = args.length;
    removeNum = Math.max(removeNum || 0, 0);
    if (numArgs === 0 || (numArgs === 2 && !removeNum)) {
      return this;
    }
    // If index is negative, it should resolve relative to the size of the
    // collection. However size may be expensive to compute if not cached, so
    // only call count() if the number is in fact negative.
    index = resolveBegin(index, index < 0 ? this.count() : this.size);
    const spliced = this.slice(0, index);
    return reify(
      this,
      numArgs === 1
        ? spliced
        : spliced.concat(arrCopy(args, 2), this.slice(index + removeNum))
    );
  },

  // ### More collection methods

  findLastIndex<V>(
    this: CollectionThis<number, V>,
    predicate: Predicate<number, V>,
    context?: ThisArg
  ): number {
    const entry = this.findLastEntry(predicate, context);
    return entry ? entry[0] : -1;
  },

  first<V, NSV>(this: CollectionThis<number, V>, notSetValue?: NSV): V | NSV {
    return this.get(0, notSetValue);
  },

  flatten<V>(this: CollectionThis<number, V>, depth?: number | boolean): OpSeq {
    return reify(this, flattenFactory(this, depth, false));
  },

  get<V, NSV>(
    this: CollectionThis<number, V>,
    index: number,
    notSetValue?: NSV
  ): V | NSV | undefined {
    index = wrapIndex(this, index);
    return index < 0 ||
      this.size === Infinity ||
      (this.size !== undefined && index > this.size)
      ? notSetValue
      : this.find((_, key) => key === index, undefined, notSetValue);
  },

  has<V>(this: CollectionThis<number, V>, index: number): boolean {
    index = wrapIndex(this, index);
    return (
      index >= 0 &&
      (this.size !== undefined
        ? this.size === Infinity || index < this.size
        : // Long-shipped quirk: unsized seqs fall back to searching for the
          // index itself as a VALUE. `indexOf` is deliberately absent from
          // OpSeq (indexed-only member); this mixin is attached only to
          // indexed prototypes, so the facet holds by construction.
          viewAs<{ indexOf(value: unknown): number }>(this).indexOf(index) !==
          -1)
    );
  },

  interpose<V>(
    this: CollectionThis<number, V>,
    separator: V
  ): OpSeq<number, V> {
    return reify(this, interposeFactory(this, separator));
  },

  interleave<V>(
    this: CollectionThis<number, V>,
    ...collectionArgs: Array<unknown>
  ): OpSeq {
    const collections = ([this] as Array<unknown>).concat(collectionArgs);
    const zipped = zipWithFactory(this.toSeq(), IndexedSeq.of, collections);
    const interleaved = zipped.flatten(true);
    if (zipped.size) {
      interleaved.size = zipped.size * collections.length;
    }
    return reify(this, interleaved);
  },

  keySeq(this: CollectionThis<number>): OpSeq<number, number> {
    return viewCollectionAs<OpSeq<number, number>>(
      new Range(0, this.size as number)
    );
  },

  last<V, NSV>(this: CollectionThis<number, V>, notSetValue?: NSV): V | NSV {
    return this.get(-1, notSetValue);
  },

  skipWhile<V>(
    this: CollectionThis<number, V>,
    predicate: Predicate<number, V>,
    context?: ThisArg
  ): OpSeq<number, V> {
    return reify(this, skipWhileFactory(this, predicate, context, false));
  },

  zip<V>(
    this: CollectionThis<number, V>,
    ...collectionArgs: Array<unknown>
  ): OpSeq {
    const collections = ([this] as Array<unknown>).concat(collectionArgs);
    return reify(this, zipWithFactory(this, defaultZipper, collections));
  },

  zipAll<V>(
    this: CollectionThis<number, V>,
    ...collectionArgs: Array<unknown>
  ): OpSeq {
    const collections = ([this] as Array<unknown>).concat(collectionArgs);
    return reify(this, zipWithFactory(this, defaultZipper, collections, true));
  },

  zipWith<V>(
    this: CollectionThis<number, V>,
    zipper: (...values: Array<unknown>) => unknown,
    ...collectionArgs: Array<unknown>
  ): OpSeq {
    const collections = ([this] as Array<unknown>).concat(collectionArgs);
    return reify(this, zipWithFactory(this, zipper, collections));
  },
};
mixin(IndexedCollection, indexedCollectionMixin);

const IndexedCollectionPrototype = IndexedCollection.prototype;
const indexedProto = writable(IndexedCollectionPrototype);
indexedProto[IS_INDEXED_SYMBOL] = true;
indexedProto[IS_ORDERED_SYMBOL] = true;

const setCollectionMixin: MixinKeys<ICollection.Set<unknown> & CollectionThis> =
  {
    // ### ES6 Collection methods (ES6 Array and Map)

    get<K, NSV>(
      this: CollectionThis<K, K>,
      value: K,
      notSetValue?: NSV
    ): K | NSV | undefined {
      return this.has(value) ? value : notSetValue;
    },

    includes<K>(this: CollectionThis<K, K>, value: K): boolean {
      return this.has(value);
    },

    // ### More sequential methods

    keySeq<K>(this: CollectionThis<K, K>): OpSeq<number, K> {
      return this.valueSeq();
    },
  };
mixin(SetCollection, setCollectionMixin);

const SetCollectionPrototype = SetCollection.prototype;
const setProto = writable(SetCollectionPrototype);
setProto['has'] = collProto['includes'];
setProto['contains'] = setProto['includes'];
setProto['keys'] = setProto['values'];

// Mixin subclasses

mixin(KeyedSeq, KeyedCollectionPrototype);
mixin(IndexedSeq, IndexedCollectionPrototype);
mixin(SetSeq, SetCollectionPrototype);

// #pragma Helper functions

function reduce<K, V, R>(
  collection: OpSeq<K, V>,
  reducer: (reduction: R, value: V, key: K, iter: object) => R,
  reduction: R | V | undefined,
  context: ThisArg,
  useFirst: boolean,
  reverse: boolean
): R {
  assertNotInfinite(collection.size);
  collection.__iterate((v, k, c) => {
    if (useFirst) {
      useFirst = false;
      reduction = v;
    } else {
      reduction = reducer.call(context, reduction as R, v, k, c);
    }
    return undefined;
  }, reverse);
  return reduction as R;
}

function keyMapper<K, V>(_v: V, k: K): K {
  return k;
}

function entryMapper<K, V>(v: V, k: K): [K, V] {
  return [k, v];
}

// Fixed-arity `.call` forwarding: predicates/comparators are always invoked
// with exactly these arguments, and a rest-param version would allocate a
// fresh array per element/comparison on hot paths under the ES5 downlevel.
function not<K, V>(predicate: Predicate<K, V>): Predicate<K, V> {
  return function (this: ThisArg, value: V, key: K, iter: object): boolean {
    return !predicate.call(this, value, key, iter);
  };
}

function neg(predicate: Comparator): Comparator {
  return function (this: ThisArg, a: unknown, b: unknown): number {
    return -predicate.call(this, a, b);
  };
}

function defaultZipper(...values: Array<unknown>): Array<unknown> {
  return arrCopy(values);
}

function defaultNegComparator(a: unknown, b: unknown): number {
  return (a as number) < (b as number)
    ? 1
    : (a as number) > (b as number)
    ? -1
    : 0;
}

function hashCollection(collection: CollectionThis): number {
  if (collection.size === Infinity) {
    return 0;
  }
  const ordered = isOrdered(collection);
  const keyed = isKeyed(collection);
  let h = ordered ? 1 : 0;

  collection.__iterate(
    keyed
      ? ordered
        ? (v, k) => {
            h = (31 * h + hashMerge(hash(v), hash(k))) | 0;
            return undefined;
          }
        : (v, k) => {
            h = (h + hashMerge(hash(v), hash(k))) | 0;
            return undefined;
          }
      : ordered
      ? v => {
          h = (31 * h + hash(v)) | 0;
          return undefined;
        }
      : v => {
          h = (h + hash(v)) | 0;
          return undefined;
        }
  );

  // `size` genuinely CAN be undefined here (unsized lazy seqs). Faithful to
  // 5.0.x: it then feeds the `^`/`imul` arithmetic below, where JS coerces
  // `undefined` to 0 — the cast preserves that shipped hashing behavior.
  return murmurHashOfSize(collection.size as number, h);
}

function murmurHashOfSize(size: number, h: number): number {
  h = imul(h, 0xcc9e2d51);
  h = imul((h << 15) | (h >>> -15), 0x1b873593);
  h = imul((h << 13) | (h >>> -13), 5);
  h = ((h + 0xe6546b64) | 0) ^ size;
  h = imul(h ^ (h >>> 16), 0x85ebca6b);
  h = imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = smi(h ^ (h >>> 16));
  return h;
}

function hashMerge(a: number, b: number): number {
  return (a ^ (b + 0x9e3779b9 + (a << 6) + (a >> 2))) | 0; // int
}
