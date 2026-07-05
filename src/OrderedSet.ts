import { SetCollection, KeyedCollection } from './Collection';
import { IS_ORDERED_SYMBOL } from './predicates/isOrdered';
import { isOrderedSet } from './predicates/isOrderedSet';
import { IndexedCollectionPrototype } from './CollectionImpl';
import { Set } from './Set';
import { OrderedMap, emptyOrderedMap } from './OrderedMap';
import { CONSTRUCT, OwnerID } from './TrieUtils';
import type { Collection as ICollection } from '../type-definitions/immutable';
import assertNotInfinite from './utils/assertNotInfinite';
import { writable } from './utils/reinterpret';

export interface OrderedSet<K> extends Set<K> {
  [IS_ORDERED_SYMBOL]: true;
  _map: OrderedMap<K, K>;

  // Attached at runtime (borrowed from IndexedCollectionPrototype below);
  // declared with the public overloads from `type-definitions/immutable.d.ts`.
  zip<U>(other: ICollection<unknown, U>): OrderedSet<[K, U]>;
  zip<U, V>(
    other1: ICollection<unknown, U>,
    other2: ICollection<unknown, V>
  ): OrderedSet<[K, U, V]>;
  zip(
    ...collections: Array<ICollection<unknown, unknown>>
  ): OrderedSet<unknown>;
  zipAll<U>(other: ICollection<unknown, U>): OrderedSet<[K, U]>;
  zipAll<U, V>(
    other1: ICollection<unknown, U>,
    other2: ICollection<unknown, V>
  ): OrderedSet<[K, U, V]>;
  zipAll(
    ...collections: Array<ICollection<unknown, unknown>>
  ): OrderedSet<unknown>;
  zipWith<U, Z>(
    zipper: (value: K, otherValue: U) => Z,
    otherCollection: ICollection<unknown, U>
  ): OrderedSet<Z>;
  zipWith<U, V, Z>(
    zipper: (value: K, otherValue: U, thirdValue: V) => Z,
    otherCollection: ICollection<unknown, U>,
    thirdCollection: ICollection<unknown, V>
  ): OrderedSet<Z>;
  zipWith<Z>(
    zipper: (...values: Array<unknown>) => Z,
    ...collections: Array<ICollection<unknown, unknown>>
  ): OrderedSet<Z>;
}
export class OrderedSet<K> extends Set<K> {
  declare static isOrderedSet: typeof isOrderedSet;

  // @pragma Construction

  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown =
      value === undefined || value === null
        ? emptyOrderedSet()
        : isOrderedSet(value)
        ? value
        : emptyOrderedSet<K>().withMutations(set => {
            const iter = new SetCollection<K>(value);
            assertNotInfinite(iter.size);
            iter.forEach((v: K) => set.add(v));
          });
    // eslint-disable-next-line no-constructor-return
    return coerced as OrderedSet<K>;
  }

  static of<K>(...values: Array<K>): OrderedSet<K>;
  static of(): OrderedSet<unknown> {
    // eslint-disable-next-line prefer-rest-params
    return new this(arguments);
  }

  static fromKeys<K>(value: Iterable<[K, unknown]>): OrderedSet<K>;
  static fromKeys(value: unknown): OrderedSet<unknown> {
    return new this(new KeyedCollection(value).keySeq());
  }

  toString(): string {
    return this.__toString('OrderedSet {', '}');
  }
}

OrderedSet.isOrderedSet = isOrderedSet;

const OrderedSetPrototype = OrderedSet.prototype;
const writableProto = writable(OrderedSetPrototype);
const indexedProto = writable(IndexedCollectionPrototype);
OrderedSetPrototype[IS_ORDERED_SYMBOL] = true;
writableProto['zip'] = indexedProto['zip'];
writableProto['zipWith'] = indexedProto['zipWith'];
writableProto['zipAll'] = indexedProto['zipAll'];

writableProto['__empty'] = emptyOrderedSet;
writableProto['__make'] = makeOrderedSet;

function makeOrderedSet<K>(
  map: OrderedMap<K, K>,
  ownerID?: OwnerID
): OrderedSet<K> {
  const set: OrderedSet<K> = Object.create(OrderedSetPrototype);
  set.size = map ? map.size : 0;
  set._map = map;
  set.__ownerID = ownerID;
  return set;
}

let EMPTY_ORDERED_SET: OrderedSet<never> | undefined;
function emptyOrderedSet<K>(): OrderedSet<K> {
  const empty =
    EMPTY_ORDERED_SET ||
    (EMPTY_ORDERED_SET = makeOrderedSet(emptyOrderedMap<never, never>()));
  // Shared empty OrderedSet: valid for any K (holds nothing); generic erased.
  return empty as OrderedSet<K>;
}
