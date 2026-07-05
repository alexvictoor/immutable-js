import { KeyedCollection } from './Collection';
import { IS_ORDERED_SYMBOL } from './predicates/isOrdered';
import { isOrderedMap } from './predicates/isOrderedMap';
import { Map, emptyMap } from './Map';
import { List, emptyList } from './List';
import {
  CONSTRUCT,
  DELETE,
  NOT_SET,
  SIZE,
  OwnerID,
  isNotSet,
} from './TrieUtils';
import type { NotSet } from './TrieUtils';
import assertNotInfinite from './utils/assertNotInfinite';
import { viewAs, writable } from './utils/reinterpret';
import type {
  IterableLike,
  IterateType,
  ImmutableIterator,
  IteratorStep,
  SideEffect,
} from './internalTypes';

type OMEntry<K, V> = [K, V];

export interface OrderedMap<K, V> extends Map<K, V> {
  [IS_ORDERED_SYMBOL]: true;
  _map: Map<K, number>;
  _list: List<OMEntry<K, V> | undefined>;
}
export class OrderedMap<K, V> extends Map<K, V> {
  declare static isOrderedMap: typeof isOrderedMap;

  // @pragma Construction

  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown =
      value === undefined || value === null
        ? emptyOrderedMap()
        : isOrderedMap(value)
        ? value
        : emptyOrderedMap<K, V>().withMutations(map => {
            const iter = new KeyedCollection<K, V>(value);
            assertNotInfinite(iter.size);
            iter.forEach((v: V, k: K) => map.set(k, v));
          });
    // eslint-disable-next-line no-constructor-return
    return coerced as OrderedMap<K, V>;
  }

  static of<K, V>(...values: Array<[K, V]>): OrderedMap<K, V>;
  static of(): OrderedMap<unknown, unknown> {
    // eslint-disable-next-line prefer-rest-params
    return new this(arguments);
  }

  toString(): string {
    return this.__toString('OrderedMap {', '}');
  }

  // @pragma Access

  get(k: K): V | undefined;
  get<NSV>(k: K, notSetValue: NSV): V | NSV;
  get<NSV>(k: K, notSetValue?: NSV): V | NSV | undefined {
    const index = this._map.get(k);
    // Faithful to 5.0.x: when _map holds an index, the corresponding _list
    // slot is never a hole unless internal state is corrupted — and
    // corruption must keep crashing loudly here (as it always has) rather
    // than silently reading as "key absent".
    return index === undefined ? notSetValue : this._list.get(index)![1];
  }

  // @pragma Modification

  clear(): this {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._map.clear();
      this._list.clear();
      this.__altered = true;
      return this;
    }
    return emptyOrderedMap() as this;
  }

  set(k: K, v: V): this {
    return updateOrderedMap(this, k, v) as this;
  }

  remove(k: K): this {
    return updateOrderedMap(this, k, NOT_SET) as this;
  }

  __iterate(fn: SideEffect<K, V, unknown>, reverse?: boolean): number {
    return this._list.__iterate(
      entry => entry && fn(entry[1], entry[0], this),
      reverse
    );
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, V>> {
    // The public entry-seq exposes the internal `__iterator` at runtime but
    // not in its public type; this view bridges that seam.
    return viewAs<Pick<IterableLike<K, V>, '__iterator'>>(
      this._list.fromEntrySeq()
    ).__iterator(type, reverse);
  }

  __ensureOwner(ownerID: OwnerID | undefined): this {
    if (ownerID === this.__ownerID) {
      return this;
    }
    const newMap = this._map.__ensureOwner(ownerID);
    const newList = this._list.__ensureOwner(ownerID);
    if (!ownerID) {
      if (this.size === 0) {
        return emptyOrderedMap() as this;
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      this._map = newMap;
      this._list = newList;
      return this;
    }
    return makeOrderedMap(newMap, newList, ownerID, this.__hash) as this;
  }
}

OrderedMap.isOrderedMap = isOrderedMap;

const OrderedMapPrototype = writable(OrderedMap.prototype);
OrderedMapPrototype[IS_ORDERED_SYMBOL] = true;
OrderedMapPrototype[DELETE] = OrderedMap.prototype.remove;

function makeOrderedMap<K, V>(
  map: Map<K, number>,
  list: List<OMEntry<K, V> | undefined>,
  ownerID?: OwnerID,
  hash?: number | undefined
): OrderedMap<K, V> {
  const omap: OrderedMap<K, V> = Object.create(OrderedMap.prototype);
  omap.size = map ? map.size : 0;
  omap._map = map;
  omap._list = list;
  omap.__ownerID = ownerID;
  omap.__hash = hash;
  omap.__altered = false;
  return omap;
}

let EMPTY_ORDERED_MAP: OrderedMap<unknown, unknown> | undefined;
export function emptyOrderedMap<K, V>(): OrderedMap<K, V> {
  const empty =
    EMPTY_ORDERED_MAP ||
    (EMPTY_ORDERED_MAP = makeOrderedMap(
      emptyMap<unknown, number>(),
      emptyList()
    ));
  // Shared empty OrderedMap: valid for any K/V (holds nothing); generic erased.
  return empty as OrderedMap<K, V>;
}

function updateOrderedMap<K, V>(
  omap: OrderedMap<K, V>,
  k: K,
  v: V | NotSet
): OrderedMap<K, V> {
  const map = omap._map;
  const list = omap._list;
  const i = map.get(k);
  let newMap: Map<K, number>;
  let newList: List<OMEntry<K, V> | undefined>;
  if (isNotSet(v)) {
    // removed
    if (i === undefined) {
      return omap;
    }
    if (list.size >= SIZE && list.size >= map.size * 2) {
      newList = list.filter(
        (entry, idx: number) => entry !== undefined && i !== idx
      );
      // The public seq chain hides the internal Map view; the runtime value is
      // a real internal Map (toMap() late-binds to the internal constructor).
      newMap = viewAs<Map<K, number>>(
        newList
          .toKeyedSeq()
          // newList was filtered above: no holes remain.
          .map(entry => entry![0])
          .flip()
          .toMap()
      );
      if (omap.__ownerID) {
        newMap.__ownerID = newList.__ownerID = omap.__ownerID;
      }
    } else {
      newMap = map.remove(k);
      newList = i === list.size - 1 ? list.pop() : list.set(i, undefined);
    }
    // v is narrowed to V below (=== NOT_SET handled above).
  } else if (i !== undefined) {
    const entry = list.get(i);
    if (entry && v === entry[1]) {
      return omap;
    }
    newMap = map;
    newList = list.set(i, [k, v]);
  } else {
    newMap = map.set(k, list.size);
    newList = list.set(list.size, [k, v]);
  }
  if (omap.__ownerID) {
    omap.size = newMap.size;
    omap._map = newMap;
    omap._list = newList;
    omap.__hash = undefined;
    omap.__altered = true;
    return omap;
  }
  return makeOrderedMap(newMap, newList);
}
