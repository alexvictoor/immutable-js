import { Collection, SetCollection, KeyedCollection } from './Collection';
import { isOrdered } from './predicates/isOrdered';
import { IS_SET_SYMBOL, isSet } from './predicates/isSet';
import { Map, emptyMap } from './Map';
import { CONSTRUCT, DELETE, OwnerID } from './TrieUtils';
import { sortFactory } from './Operations';
import type { ThisArg } from './Operations';
import { viewAs, viewCollectionAs, writable } from './utils/reinterpret';
import assertNotInfinite from './utils/assertNotInfinite';
import { asImmutable } from './methods/asImmutable';
import { asMutable } from './methods/asMutable';
import { withMutations } from './methods/withMutations';

import { OrderedSet } from './OrderedSet';
import type { Collection as ICollection } from '../type-definitions/immutable';
import type {
  IterateType,
  ImmutableIterator,
  IteratorStep,
  SideEffect,
} from './internalTypes';

export interface Set<K> extends SetCollection<K> {
  size: number;
  [IS_SET_SYMBOL]: true;
  _map: Map<K, K>;

  // Attached on the prototype below.
  __empty(): Set<K>;
  __make(map: Map<K, K>, ownerID?: OwnerID): Set<K>;
  withMutations(mutator: (mutable: this) => unknown): this;
  asImmutable(): this;
  asMutable(): this;
  merge(...iters: Array<unknown>): this;
  concat(...iters: Array<unknown>): this;
}
export class Set<K> extends SetCollection<K> {
  declare static isSet: typeof isSet;

  // @pragma Construction

  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown =
      value === undefined || value === null
        ? emptySet()
        : isSet(value) && !isOrdered(value)
        ? value
        : emptySet<K>().withMutations(set => {
            const iter = new SetCollection<K>(value);
            assertNotInfinite(iter.size);
            iter.forEach((v: K) => set.add(v));
          });
    // eslint-disable-next-line no-constructor-return
    return coerced as Set<K>;
  }

  static of<K>(...values: Array<K>): Set<K>;
  static of(): Set<unknown> {
    // eslint-disable-next-line prefer-rest-params
    return new this(arguments);
  }

  static fromKeys<K>(value: Iterable<[K, unknown]>): Set<K>;
  static fromKeys(value: unknown): Set<unknown> {
    return new this(new KeyedCollection(value).keySeq());
  }

  static intersect(sets: Iterable<Iterable<unknown>>): Set<unknown> {
    const setsArray = viewCollectionAs<ICollection<unknown, Iterable<unknown>>>(
      new Collection(sets)
    ).toArray();
    return setsArray.length
      ? // `callableAs` cannot claim this signature — its params are narrower
        // than the Top-wide ones the helper requires (see the exceptions note
        // in utils/reinterpret.ts).
        (
          SetPrototype.intersect as (
            ...s: Array<Iterable<unknown>>
          ) => Set<unknown>
        ).apply(new Set(setsArray.pop()), setsArray)
      : emptySet();
  }

  static union(sets: Iterable<Iterable<unknown>>): Set<unknown> {
    const setsArray = viewCollectionAs<ICollection<unknown, Iterable<unknown>>>(
      new Collection(sets)
    ).toArray();
    return setsArray.length
      ? // Same `callableAs` exception as `intersect` above.
        (
          SetPrototype.union as (...s: Array<Iterable<unknown>>) => Set<unknown>
        ).apply(new Set(setsArray.pop()), setsArray)
      : emptySet();
  }

  toString(): string {
    return this.__toString('Set {', '}');
  }

  // @pragma Access

  has(value: K): boolean {
    return this._map.has(value);
  }

  // @pragma Modification

  add(value: K): this {
    return updateSet(this, this._map.set(value, value)) as this;
  }

  remove(value: K): this {
    return updateSet(this, this._map.remove(value)) as this;
  }

  clear(): this {
    return updateSet(this, this._map.clear()) as this;
  }

  // @pragma Composition

  map<M>(
    mapper: (value: K, key: K, iter: this) => M,
    context?: ThisArg
  ): Set<M> {
    // keep track if the set is altered by the map function
    let didChanges = false;

    const newMap = updateSet(
      this,
      viewAs<Map<K, K>>(
        this._map.mapEntries(([, v]: [K, K]) => {
          const mapped = mapper.call(context, v, v, this);

          if ((mapped as unknown) !== v) {
            didChanges = true;
          }

          return [mapped, mapped];
        }, context)
      )
    );

    return viewCollectionAs<Set<M>>(didChanges ? newMap : this);
  }

  union(...iters: Array<Iterable<K>>): this {
    const filtered = iters.filter(x => (x as { size?: number }).size !== 0);
    if (filtered.length === 0) {
      return this;
    }
    if (this.size === 0 && !this.__ownerID && filtered.length === 1) {
      // Called without `new` to match the original factory-coercion semantics.
      return (this.constructor as (value: unknown) => this)(filtered[0]);
    }
    return this.withMutations(set => {
      for (let ii = 0; ii < filtered.length; ii++) {
        const iter = filtered[ii];
        if (typeof iter === 'string') {
          // Documented union() quirk: a string is added whole, as one element.
          // K is erased at runtime; a primitive can't go through `viewAs`.
          set.add(iter as unknown as K);
        } else {
          new SetCollection<K>(iter).forEach((value: K) => set.add(value));
        }
      }
    });
  }

  intersect(...iters: Array<Iterable<K>>): this {
    if (iters.length === 0) {
      return this;
    }
    const collections = iters.map(iter => new SetCollection<K>(iter));
    const toRemove: Array<K> = [];
    this.forEach((value: K) => {
      if (!collections.every(iter => iter.includes(value))) {
        toRemove.push(value);
      }
    });
    return this.withMutations(set => {
      toRemove.forEach(value => {
        set.remove(value);
      });
    });
  }

  subtract(...iters: Array<Iterable<K>>): this {
    if (iters.length === 0) {
      return this;
    }
    const collections = iters.map(iter => new SetCollection<K>(iter));
    const toRemove: Array<K> = [];
    this.forEach((value: K) => {
      if (collections.some(iter => iter.includes(value))) {
        toRemove.push(value);
      }
    });
    return this.withMutations(set => {
      toRemove.forEach(value => {
        set.remove(value);
      });
    });
  }

  sort(comparator?: (a: K, b: K) => number): this {
    // Late binding
    return viewCollectionAs<this>(
      new OrderedSet(sortFactory(this, comparator, undefined))
    );
  }

  sortBy<C>(
    mapper: (value: K, key: K, iter: this) => C,
    comparator?: (a: C, b: C) => number
  ): this {
    // Late binding
    return viewCollectionAs<this>(
      new OrderedSet(sortFactory(this, comparator, mapper))
    );
  }

  wasAltered(): boolean {
    return this._map.wasAltered();
  }

  __iterate(fn: SideEffect<K, K, unknown>, reverse?: boolean): number {
    return this._map.__iterate(k => fn(k, k, this), reverse);
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, K>> {
    return this._map.__iterator(type, reverse);
  }

  __ensureOwner(ownerID: OwnerID | undefined): this {
    if (ownerID === this.__ownerID) {
      return this;
    }
    const newMap = this._map.__ensureOwner(ownerID);
    if (!ownerID) {
      if (this.size === 0) {
        return this.__empty() as this;
      }
      this.__ownerID = ownerID;
      this._map = newMap;
      return this;
    }
    return this.__make(newMap, ownerID) as this;
  }
}

Set.isSet = isSet;

const SetPrototype = Set.prototype;
const writableProto = writable(SetPrototype);
SetPrototype[IS_SET_SYMBOL] = true;
writableProto[DELETE] = SetPrototype.remove;
writableProto['merge'] = writableProto['concat'] = SetPrototype.union;
writableProto['withMutations'] = withMutations;
writableProto['asImmutable'] = asImmutable;
writableProto['@@transducer/init'] = writableProto['asMutable'] = asMutable;
writableProto['@@transducer/step'] = function (
  result: Set<unknown>,
  arr: unknown
) {
  return result.add(arr);
};
writableProto['@@transducer/result'] = function (obj: Set<unknown>) {
  return obj.asImmutable();
};
writableProto['__empty'] = emptySet;
writableProto['__make'] = makeSet;

function updateSet<K>(set: Set<K>, newMap: Map<K, K>): Set<K> {
  if (set.__ownerID) {
    set.size = newMap.size;
    set._map = newMap;
    return set;
  }
  return newMap === set._map
    ? set
    : newMap.size === 0
    ? set.__empty()
    : set.__make(newMap);
}

function makeSet<K>(map: Map<K, K>, ownerID?: OwnerID): Set<K> {
  const set: Set<K> = Object.create(SetPrototype);
  set.size = map ? map.size : 0;
  set._map = map;
  set.__ownerID = ownerID;
  return set;
}

let EMPTY_SET: Set<never> | undefined;
function emptySet<K>(): Set<K> {
  // Shared empty Set: valid `Set<K>` for any K (holds nothing); generic erased.
  return (EMPTY_SET ||
    (EMPTY_SET = makeSet(emptyMap<never, never>()))) as Set<K>;
}
