import { CONSTRUCT, wrapIndex } from './TrieUtils';
import { Collection } from './Collection';
import { IS_SEQ_SYMBOL, isSeq } from './predicates/isSeq';
import { isImmutable } from './predicates/isImmutable';
import { isCollection } from './predicates/isCollection';
import { isKeyed } from './predicates/isKeyed';
import { isAssociative } from './predicates/isAssociative';
import { isRecord } from './predicates/isRecord';
import { IS_ORDERED_SYMBOL } from './predicates/isOrdered';
import {
  Iterator,
  iteratorValue,
  iteratorDone,
  hasIterator,
  isIterator,
  getIterator,
  isEntriesIterable,
  isKeysIterable,
} from './Iterator';

import hasOwnProperty from './utils/hasOwnProperty';
import isArrayLike from './utils/isArrayLike';
import type {
  Seq as ISeq,
  Collection as ICollection,
} from '../type-definitions/immutable';
import type {
  IterateType,
  ImmutableIterator,
  IteratorStep,
  SeqInternalMethods,
  SideEffect,
} from './internalTypes';

type Step<K, V> = SideEffect<K, V, unknown>;

// The base `Seq` carries only the internal machinery plus the members its own
// class body touches. The refined public API (whose return types differ between
// Keyed/Indexed/Set) lives on those subtypes, avoiding refinement clashes.
// A mutable `size: number | undefined` comes from `SeqInternalMethods`, so the
// implementation may perform its transient writes.
export interface Seq<K, V> extends SeqInternalMethods<K, V> {
  // Non-refined member the base class body relies on; typed with the public
  // return type so subtypes that carry the refined public API do not clash.
  entrySeq(): ISeq.Indexed<[K, V]>;
}
export class Seq<K, V> extends Collection<K, V> {
  declare [IS_SEQ_SYMBOL]: true;
  declare static isSeq: typeof isSeq;
  declare static Keyed: typeof KeyedSeq;
  declare static Set: typeof SetSeq;
  declare static Indexed: typeof IndexedSeq;

  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    // Coercion factory: the produced value is genuinely a Seq at runtime; the
    // widening bridges the public method return types back to this class.
    const coerced: unknown =
      value === undefined || value === null
        ? emptySequence()
        : isImmutable(value)
        ? value.toSeq()
        : seqFromValue(value);
    // eslint-disable-next-line no-constructor-return
    return coerced as Seq<K, V>;
  }

  toSeq(): this {
    return this;
  }

  toString(): string {
    return this.__toString('Seq {', '}');
  }

  cacheResult(): this {
    if (!this._cache && this.__iterateUncached) {
      this._cache = this.entrySeq().toArray() as Array<[K, V]>;
      this.size = this._cache.length;
    }
    return this;
  }

  // abstract __iterateUncached(fn, reverse)

  __iterate(fn: Step<K, V>, reverse?: boolean): number {
    const cache = this._cache;
    if (cache) {
      const size = cache.length;
      let i = 0;
      while (i !== size) {
        const entry = cache[reverse ? size - ++i : i++]!;
        if (fn(entry[1], entry[0], this) === false) {
          break;
        }
      }
      return i;
    }
    // Reached only by seqs that provide `__iterateUncached` (root/leaf seqs
    // override `__iterate` and never fall through here).
    return this.__iterateUncached!(fn, reverse);
  }

  // abstract __iteratorUncached(type, reverse)

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, V>> {
    const cache = this._cache;
    if (cache) {
      const size = cache.length;
      let i = 0;
      return new Iterator(() => {
        if (i === size) {
          return iteratorDone();
        }
        const entry = cache[reverse ? size - ++i : i++]!;
        return iteratorValue(type, entry[0], entry[1]);
      });
    }
    return this.__iteratorUncached!(type, reverse);
  }
}

export interface KeyedSeq<K, V> extends ISeq.Keyed<K, V> {
  size: number | undefined;
}
export class KeyedSeq<K, V> extends Seq<K, V> {
  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown =
      value === undefined || value === null
        ? emptySequence().toKeyedSeq()
        : isCollection(value)
        ? isKeyed(value)
          ? value.toSeq()
          : (value as ICollection.Indexed<unknown>).fromEntrySeq()
        : isRecord(value)
        ? value.toSeq()
        : keyedSeqFromValue(value);
    // eslint-disable-next-line no-constructor-return
    return coerced as KeyedSeq<K, V>;
  }

  toKeyedSeq(): this {
    return this;
  }
}

export interface IndexedSeq<T> extends ISeq.Indexed<T> {
  size: number | undefined;
}
export class IndexedSeq<T> extends Seq<number, T> {
  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown =
      value === undefined || value === null
        ? emptySequence()
        : isCollection(value)
        ? isKeyed(value)
          ? value.entrySeq()
          : value.toIndexedSeq()
        : isRecord(value)
        ? value.toSeq().entrySeq()
        : indexedSeqFromValue(value);
    // eslint-disable-next-line no-constructor-return
    return coerced as IndexedSeq<T>;
  }

  static of<T>(...values: Array<T>): IndexedSeq<T>;
  static of(): IndexedSeq<unknown> {
    // eslint-disable-next-line prefer-rest-params
    return new IndexedSeq(arguments);
  }

  toIndexedSeq(): this {
    return this;
  }

  toString(): string {
    return this.__toString('Seq [', ']');
  }
}

export interface SetSeq<T> extends ISeq.Set<T> {
  size: number | undefined;
}
export class SetSeq<T> extends Seq<T, T> {
  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown = (
      isCollection(value) && !isAssociative(value)
        ? value
        : new IndexedSeq(value)
    ).toSetSeq();
    // eslint-disable-next-line no-constructor-return
    return coerced as SetSeq<T>;
  }

  static of<T>(...values: Array<T>): SetSeq<T>;
  static of(): SetSeq<unknown> {
    // eslint-disable-next-line prefer-rest-params
    return new SetSeq(arguments);
  }

  toSetSeq(): this {
    return this;
  }
}

Seq.isSeq = isSeq;
Seq.Keyed = KeyedSeq;
Seq.Set = SetSeq;
Seq.Indexed = IndexedSeq;

Seq.prototype[IS_SEQ_SYMBOL] = true;

// #pragma Root Sequences

export class ArraySeq<T> extends IndexedSeq<T> {
  _array: ArrayLike<T>;

  constructor(array: ArrayLike<T>) {
    super(CONSTRUCT);
    this._array = array;
    this.size = array.length;
  }

  get<NSV>(index: number, notSetValue?: NSV): T | NSV {
    return this.has(index)
      ? (this._array[wrapIndex(this, index)] as T)
      : (notSetValue as NSV);
  }

  __iterate(fn: Step<number, T>, reverse?: boolean): number {
    const array = this._array;
    const size = array.length;
    let i = 0;
    while (i !== size) {
      const ii = reverse ? size - ++i : i++;
      if (fn(array[ii]!, ii, this) === false) {
        break;
      }
    }
    return i;
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<number, T>> {
    const array = this._array;
    const size = array.length;
    let i = 0;
    return new Iterator(() => {
      if (i === size) {
        return iteratorDone();
      }
      const ii = reverse ? size - ++i : i++;
      return iteratorValue(type, ii, array[ii]);
    });
  }
}

// Quirk: the class claims `KeyedSeq<string, V>` yet iterates SYMBOL keys too
// (below) — faithful to the public contract, where `Seq({...})` has always
// been typed with string keys while yielding symbols at runtime; the
// `key as string` in the iteration paths papers over exactly that.
class ObjectSeq<V> extends KeyedSeq<string, V> {
  declare [IS_ORDERED_SYMBOL]: true;
  _object: { [key: PropertyKey]: V };
  _keys: Array<string | symbol>;

  constructor(object: { [key: string]: V }) {
    super(CONSTRUCT);
    const keys = (Object.keys(object) as Array<string | symbol>).concat(
      Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(object) : []
    );
    this._object = object;
    this._keys = keys;
    this.size = keys.length;
  }

  get<NSV>(key: string, notSetValue?: NSV): V | NSV {
    if (notSetValue !== undefined && !this.has(key)) {
      return notSetValue as NSV;
    }
    return this._object[key] as V;
  }

  has(key: string): boolean {
    return hasOwnProperty.call(this._object, key);
  }

  __iterate(fn: Step<string, V>, reverse?: boolean): number {
    const object = this._object;
    const keys = this._keys;
    const size = keys.length;
    let i = 0;
    while (i !== size) {
      const key = keys[reverse ? size - ++i : i++]!;
      if (fn(object[key]!, key as string, this) === false) {
        break;
      }
    }
    return i;
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<string, V>> {
    const object = this._object;
    const keys = this._keys;
    const size = keys.length;
    let i = 0;
    return new Iterator(() => {
      if (i === size) {
        return iteratorDone();
      }
      const key = keys[reverse ? size - ++i : i++]!;
      return iteratorValue(type, key, object[key]);
    });
  }
}
ObjectSeq.prototype[IS_ORDERED_SYMBOL] = true;

class CollectionSeq<T> extends IndexedSeq<T> {
  _collection: { length?: number; size?: number };

  constructor(collection: { length?: number; size?: number }) {
    super(CONSTRUCT);
    this._collection = collection;
    this.size = collection.length || collection.size;
  }

  __iterateUncached(fn: Step<number, T>, reverse?: boolean): number {
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    const collection = this._collection;
    const iterator = getIterator(collection);
    let iterations = 0;
    if (isIterator(iterator)) {
      let step;
      while (!(step = iterator.next()).done) {
        if (fn(step.value as T, iterations++, this) === false) {
          break;
        }
      }
    }
    return iterations;
  }

  __iteratorUncached(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<number, T>> {
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    const collection = this._collection;
    const iterator = getIterator(collection);
    if (!isIterator(iterator)) {
      return new Iterator(iteratorDone);
    }
    let iterations = 0;
    return new Iterator(() => {
      const step = iterator.next();
      return step.done ? step : iteratorValue(type, iterations++, step.value);
    });
  }
}

// # pragma Helper functions

let EMPTY_SEQ: ArraySeq<unknown> | undefined;

function emptySequence(): ArraySeq<unknown> {
  return EMPTY_SEQ || (EMPTY_SEQ = new ArraySeq<unknown>([]));
}

export function keyedSeqFromValue(
  value: unknown
): ISeq.Keyed<unknown, unknown> {
  const seq = maybeIndexedSeqFromValue(value);
  if (seq) {
    return seq.fromEntrySeq();
  }
  // No null check, faithful to 5.0.x: `typeof null === 'object'` enters
  // ObjectSeq, whose `Object.keys(null)` throws the built-in TypeError
  // ("Cannot convert undefined or null to object"), not the message below.
  if (typeof value === 'object') {
    return new ObjectSeq(value as { [key: string]: unknown });
  }
  throw new TypeError(
    'Expected Array or collection object of [k, v] entries, or keyed object: ' +
      value
  );
}

export function indexedSeqFromValue(value: unknown): IndexedSeq<unknown> {
  const seq = maybeIndexedSeqFromValue(value);
  if (seq) {
    return seq;
  }
  throw new TypeError(
    'Expected Array or collection object of values: ' + value
  );
}

function seqFromValue(value: unknown): ISeq<unknown, unknown> {
  const seq = maybeIndexedSeqFromValue(value);
  if (seq) {
    return isEntriesIterable(value)
      ? seq.fromEntrySeq()
      : isKeysIterable(value)
      ? seq.toSetSeq()
      : seq;
  }
  // No null check, faithful to 5.0.x (see keyedSeqFromValue above).
  if (typeof value === 'object') {
    return new ObjectSeq(value as { [key: string]: unknown });
  }
  throw new TypeError(
    'Expected Array or collection object of values, or keyed object: ' + value
  );
}

function maybeIndexedSeqFromValue(
  value: unknown
): IndexedSeq<unknown> | undefined {
  return isArrayLike(value)
    ? new ArraySeq(value)
    : hasIterator(value)
    ? new CollectionSeq(value as { length?: number; size?: number })
    : undefined;
}
