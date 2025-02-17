/** @import * as Immutable from '../type-definitions/immutable'*/
import { Seq, KeyedSeq, IndexedSeq, SetSeq } from './Seq';
import { isCollection } from './predicates/isCollection';
import { isKeyed } from './predicates/isKeyed';
import { isIndexed } from './predicates/isIndexed';
import { isAssociative } from './predicates/isAssociative';


/**
 * @template {CollectionImpl<?, ?> | Iterable<?> | ArrayLike<?> | Record<string, ?>} T
 * @param {T} [value]
 * @returns { T extends Iterable<infer V> | ArrayLike<infer V> ? IndexedCollectionImpl<V> : T extends Record<string, infer V> ?  KeyedCollectionImpl<string, V> : CollectionImpl<unknown, unknown>}
 */


/**
 * @type  {typeof Immutable.Collection}
 */
export const Collection = (value) => (isCollection(value) ? value : Seq(value));

/**
 * @template K, V
 */
export class CollectionImpl {
  /**
   * @abstract
   * @param {(value: V | undefined, key: K, collection: CollectionImpl<K, V>) => {} | T | undefined} _fn
   * @param {boolean} _reverse
   * @returns {number}
   */
  __iterate(_fn, _reverse) {
    throw new Error('Not implemented!');
  }

  /**
   * @abstract
   * @param {0 | 1 | 2} _type
   * @param {boolean} _reverse
   * @returns {import('./Iterator').Iterator<T>}
   */
  __iterator(_type, _reverse) {
    throw new Error('Not implemented!');
  }
}

/**
 * @template {Iterable<[?, ?]> | Record<string, ?>} T
 * @param {T} [collection]
 * @returns {T extends Iterable<infer K, infer V> ? KeyedCollectionImpl<K, V> : T extends Record<string, infer V> ? KeyedCollectionImpl<string, V> : KeyedCollectionImpl<unknown, unknown> }
 */
export const KeyedCollection = (collection) =>
  isKeyed(collection) ? collection : KeyedSeq(collection);

/**
 * @template K, V
 * @extends {CollectionImpl<K, V>}
 */
export class KeyedCollectionImpl extends CollectionImpl {}

/**
 * @template T
 * @param {Iterable<T> | ArrayLike<T>} [collection]
 * @returns {Immutable.IndexedCollection<T>}
 */
export const IndexedCollection = (collection) =>
  isIndexed(collection) ? collection : IndexedSeq(collection);

/**
 * @template T
 * @extends {CollectionImpl<number, T>}
 */
export class IndexedCollectionImpl extends CollectionImpl {}

/**
 * @param {Iterable<T> | ArrayLike<T>} [collection]
 * @returns {SetCollectionImpl<T>}
 */
export const SetCollection = (collection) =>
  isCollection(collection) && !isAssociative(collection)
    ? collection
    : SetSeq(collection);

/**
 * @template T
 * @extends {CollectionImpl<T, T>}
 */
export class SetCollectionImpl extends CollectionImpl {}

Collection.Keyed = KeyedCollection;
Collection.Indexed = IndexedCollection;
Collection.Set = SetCollection;
