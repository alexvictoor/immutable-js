import { is } from './is';
import { Collection, KeyedCollection } from './Collection';
import { IS_MAP_SYMBOL, isMap } from './predicates/isMap';
import { isOrdered } from './predicates/isOrdered';
import {
  CONSTRUCT,
  DELETE,
  SHIFT,
  SIZE,
  MASK,
  NOT_SET,
  isNotSet,
  OwnerID,
  MakeRef,
  SetRef,
} from './TrieUtils';
import type { NotSet } from './TrieUtils';
import { hash } from './Hash';
import { Iterator, iteratorValue, iteratorDone } from './Iterator';
import { sortFactory } from './Operations';
import type { ThisArg, IterationResult } from './Operations';
import { reparam, viewCollectionAs, writable } from './utils/reinterpret';
import arrCopy from './utils/arrCopy';
import assertNotInfinite from './utils/assertNotInfinite';
import { setIn } from './methods/setIn';
import { deleteIn } from './methods/deleteIn';
import { update } from './methods/update';
import { updateIn } from './methods/updateIn';
import { merge, mergeWith } from './methods/merge';
import { mergeDeep, mergeDeepWith } from './methods/mergeDeep';
import { mergeIn } from './methods/mergeIn';
import { mergeDeepIn } from './methods/mergeDeepIn';
import { withMutations } from './methods/withMutations';
import { asMutable } from './methods/asMutable';
import { asImmutable } from './methods/asImmutable';
import { wasAltered } from './methods/wasAltered';

import { OrderedMap } from './OrderedMap';
import type {
  IterateType,
  ImmutableIterator,
  ImmIteratorResult,
  IteratorStep,
  Ref,
  SideEffect,
} from './internalTypes';

type MapEntry<K, V> = [K, V];

// The behavioral surface shared by every trie node kind. `update`'s value
// also carries the branded NOT_SET sentinel, which requests removal of the
// key.
interface MapNodeBase<K, V> {
  ownerID?: OwnerID | undefined;
  get<NSV>(
    shift: number,
    keyHash: number | undefined,
    key: K,
    notSetValue: NSV
  ): V | NSV;
  update(
    ownerID: OwnerID | undefined,
    shift: number,
    keyHash: number | undefined,
    key: K,
    value: V | NotSet,
    didChangeSize?: Ref,
    didAlter?: Ref
  ): MapNode<K, V> | undefined;
  iterate(
    fn: (entry: MapEntry<K, V>) => IterationResult,
    reverse?: boolean
  ): boolean | undefined;
}

// A trie node is exactly one of the five concrete kinds. Their distinct
// payload members (`entry` / `entries` / `nodes`) make the union
// discriminable with `in` checks — see the iterator's narrowing below.
type MapNode<K, V> =
  | ArrayMapNode<K, V>
  | BitmapIndexedNode<K, V>
  | HashArrayMapNode<K, V>
  | HashCollisionNode<K, V>
  | ValueNode<K, V>;

export interface Map<K, V> extends KeyedCollection<K, V> {
  // A Map always knows its size (narrows the base's `number | undefined`).
  size: number;
  [IS_MAP_SYMBOL]: true;
  _root: MapNode<K, V> | null;

  // Attached on the prototype at load time; declared here because Map.ts's own
  // methods (and the group factories in Operations) invoke them. The remaining
  // public API (setIn/merge/…) is inherited from the public Keyed interface
  // via the base class.
  withMutations(mutator: (mutable: this) => unknown): this;
  wasAltered(): boolean;
  asImmutable(): this;
  asMutable(): this;
  update<R>(updater: (value: this) => R): R;
  update(key: K, notSetValue: V, updater: (value: V) => V): this;
  update(key: K, updater: (value: V | undefined) => V): this;
}
export class Map<K, V> extends KeyedCollection<K, V> {
  declare static isMap: typeof isMap;

  // @pragma Construction

  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown =
      value === undefined || value === null
        ? emptyMap()
        : isMap(value) && !isOrdered(value)
        ? value
        : emptyMap<K, V>().withMutations(map => {
            const iter = new KeyedCollection<K, V>(value);
            assertNotInfinite(iter.size);
            iter.forEach((v: V, k: K) => map.set(k, v));
          });
    // eslint-disable-next-line no-constructor-return
    return coerced as Map<K, V>;
  }

  toString(): string {
    return this.__toString('Map {', '}');
  }

  // @pragma Access

  get(k: K): V | undefined;
  get<NSV>(k: K, notSetValue: NSV): V | NSV;
  get<NSV>(k: K, notSetValue?: NSV): V | NSV | undefined {
    return this._root
      ? this._root.get(0, undefined, k, notSetValue)
      : notSetValue;
  }

  // @pragma Modification

  set(k: K, v: V): this {
    return updateMap(this, k, v) as this;
  }

  remove(k: K): this {
    return updateMap(this, k, NOT_SET) as this;
  }

  deleteAll(keys: Iterable<K>): this {
    const collection = new Collection<unknown, K>(keys);

    if (collection.size === 0) {
      return this;
    }

    return this.withMutations(map => {
      // Equivalent to the original `collection.forEach(...)`: forEach asserts
      // finiteness before iterating, so an infinite keys collection throws
      // instead of spinning forever.
      assertNotInfinite(collection.size);
      collection.__iterate(key => map.remove(key));
    });
  }

  clear(): this {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._root = null;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyMap() as this;
  }

  // @pragma Composition

  sort(comparator?: (a: V, b: V) => number): this {
    // Late binding: returns an OrderedMap (a Map subtype).
    return viewCollectionAs<this>(
      new OrderedMap(sortFactory(this, comparator, undefined))
    );
  }

  sortBy<C>(
    mapper: (value: V, key: K, iter: this) => C,
    comparator?: (a: C, b: C) => number
  ): this {
    // Late binding: returns an OrderedMap (a Map subtype).
    return viewCollectionAs<this>(
      new OrderedMap(sortFactory(this, comparator, mapper))
    );
  }

  map<M>(
    mapper: (value: V, key: K, iter: this) => M,
    context?: ThisArg
  ): Map<K, M> {
    const result = this.withMutations(map => {
      // While mutating in place the map transiently holds both original and
      // mapped values.
      const m = reparam<Map<K, V | M>>(map);
      m.forEach((value, key) => {
        m.set(key, mapper.call(context, value as V, key, this));
      });
    });
    // Values are transformed V -> M; the class is invariant so the checker
    // cannot see the reparametrization the map performs.
    return reparam<Map<K, M>>(result);
  }

  // @pragma Mutability

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, V>> {
    return new MapIterator(this, type, reverse);
  }

  __iterate(fn: SideEffect<K, V, unknown>, reverse?: boolean): number {
    let iterations = 0;
    this._root &&
      this._root.iterate(entry => {
        iterations++;
        return fn(entry[1], entry[0], this);
      }, reverse);
    return iterations;
  }

  __ensureOwner(ownerID: OwnerID | undefined): this {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      if (this.size === 0) {
        return emptyMap() as this;
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeMap(this.size, this._root, ownerID, this.__hash) as this;
  }
}

Map.isMap = isMap;

const MapPrototype = Map.prototype;
// The mixin/alias methods below are attached at runtime; assignments go through
// this writable view so the (intentionally looser) prototype method identities
// don't fight the precise instance declarations.
const writableProto = writable(MapPrototype);
MapPrototype[IS_MAP_SYMBOL] = true;
writableProto[DELETE] = MapPrototype.remove;
writableProto['removeAll'] = MapPrototype.deleteAll;
writableProto['setIn'] = setIn;
writableProto['removeIn'] = writableProto['deleteIn'] = deleteIn;
writableProto['update'] = update;
writableProto['updateIn'] = updateIn;
writableProto['merge'] = writableProto['concat'] = merge;
writableProto['mergeWith'] = mergeWith;
writableProto['mergeDeep'] = mergeDeep;
writableProto['mergeDeepWith'] = mergeDeepWith;
writableProto['mergeIn'] = mergeIn;
writableProto['mergeDeepIn'] = mergeDeepIn;
writableProto['withMutations'] = withMutations;
writableProto['wasAltered'] = wasAltered;
writableProto['asImmutable'] = asImmutable;
writableProto['@@transducer/init'] = writableProto['asMutable'] = asMutable;
writableProto['@@transducer/step'] = function (
  result: Map<unknown, unknown>,
  arr: MapEntry<unknown, unknown>
) {
  return result.set(arr[0], arr[1]);
};
writableProto['@@transducer/result'] = function (obj: Map<unknown, unknown>) {
  return obj.asImmutable();
};

// #pragma Trie Nodes

class ArrayMapNode<K, V> implements MapNodeBase<K, V> {
  declare iterate: MapNodeBase<K, V>['iterate'];

  constructor(
    public ownerID: OwnerID | undefined,
    public entries: Array<MapEntry<K, V>>
  ) {}

  get<NSV>(
    _shift: number,
    _keyHash: number | undefined,
    key: K,
    notSetValue: NSV
  ): V | NSV {
    const entries = this.entries;
    for (let ii = 0, len = entries.length; ii < len; ii++) {
      if (is(key, entries[ii]![0])) {
        return entries[ii]![1];
      }
    }
    return notSetValue;
  }

  update(
    ownerID: OwnerID | undefined,
    _shift: number,
    _keyHash: number | undefined,
    key: K,
    value: V | NotSet,
    didChangeSize?: Ref,
    didAlter?: Ref
  ): MapNode<K, V> | undefined {
    const removed = isNotSet(value);

    const entries = this.entries;
    let idx = 0;
    const len = entries.length;
    for (; idx < len; idx++) {
      if (is(key, entries[idx]![0])) {
        break;
      }
    }
    const exists = idx < len;

    if (exists ? entries[idx]![1] === value : removed) {
      return this;
    }

    SetRef(didAlter);
    (removed || !exists) && SetRef(didChangeSize);

    if (removed && entries.length === 1) {
      return undefined;
    }

    if (!exists && !removed && entries.length >= MAX_ARRAY_MAP_SIZE) {
      return createNodes(ownerID, entries, key, value);
    }

    const isEditable = ownerID && ownerID === this.ownerID;
    const newEntries = isEditable ? entries : arrCopy(entries);

    if (exists) {
      if (removed) {
        idx === len - 1
          ? newEntries.pop()
          : (newEntries[idx] = newEntries.pop()!);
      } else {
        newEntries[idx] = [key, value];
      }
    } else {
      // A missing key with a NOT_SET value returned early above, so this
      // insertion always carries a real V.
      newEntries.push([key, value as V]);
    }

    if (isEditable) {
      this.entries = newEntries;
      return this;
    }

    return new ArrayMapNode(ownerID, newEntries);
  }
}

class BitmapIndexedNode<K, V> implements MapNodeBase<K, V> {
  declare iterate: MapNodeBase<K, V>['iterate'];

  constructor(
    public ownerID: OwnerID | undefined,
    public bitmap: number,
    public nodes: Array<MapNode<K, V> | undefined>
  ) {}

  get<NSV>(
    shift: number,
    keyHash: number | undefined,
    key: K,
    notSetValue: NSV
  ): V | NSV {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    const bit = 1 << ((shift === 0 ? keyHash : keyHash >>> shift) & MASK);
    const bitmap = this.bitmap;
    return (bitmap & bit) === 0
      ? notSetValue
      : this.nodes[popCount(bitmap & (bit - 1))]!.get(
          shift + SHIFT,
          keyHash,
          key,
          notSetValue
        );
  }

  update(
    ownerID: OwnerID | undefined,
    shift: number,
    keyHash: number | undefined,
    key: K,
    value: V | NotSet,
    didChangeSize?: Ref,
    didAlter?: Ref
  ): MapNode<K, V> | undefined {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    const keyHashFrag = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
    const bit = 1 << keyHashFrag;
    const bitmap = this.bitmap;
    const exists = (bitmap & bit) !== 0;

    if (!exists && isNotSet(value)) {
      return this;
    }

    const idx = popCount(bitmap & (bit - 1));
    const nodes = this.nodes;
    const node = exists ? nodes[idx] : undefined;
    const newNode = updateNode(
      node,
      ownerID,
      shift + SHIFT,
      keyHash,
      key,
      value,
      didChangeSize,
      didAlter
    );

    if (newNode === node) {
      return this;
    }

    if (!exists && newNode && nodes.length >= MAX_BITMAP_INDEXED_SIZE) {
      return expandNodes(ownerID, nodes, bitmap, keyHashFrag, newNode);
    }

    if (
      exists &&
      !newNode &&
      nodes.length === 2 &&
      isLeafNode(nodes[idx ^ 1]!)
    ) {
      return nodes[idx ^ 1];
    }

    if (exists && newNode && nodes.length === 1 && isLeafNode(newNode)) {
      return newNode;
    }

    const isEditable = ownerID && ownerID === this.ownerID;
    const newBitmap = exists ? (newNode ? bitmap : bitmap ^ bit) : bitmap | bit;
    const newNodes = exists
      ? newNode
        ? setAt(nodes, idx, newNode, isEditable)
        : spliceOut(nodes, idx, isEditable)
      : spliceIn(nodes, idx, newNode, isEditable);

    if (isEditable) {
      this.bitmap = newBitmap;
      this.nodes = newNodes;
      return this;
    }

    return new BitmapIndexedNode(ownerID, newBitmap, newNodes);
  }
}

class HashArrayMapNode<K, V> implements MapNodeBase<K, V> {
  declare iterate: MapNodeBase<K, V>['iterate'];

  constructor(
    public ownerID: OwnerID | undefined,
    public count: number,
    public nodes: Array<MapNode<K, V> | undefined>
  ) {}

  get<NSV>(
    shift: number,
    keyHash: number | undefined,
    key: K,
    notSetValue: NSV
  ): V | NSV {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    const idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
    const node = this.nodes[idx];
    return node
      ? node.get(shift + SHIFT, keyHash, key, notSetValue)
      : notSetValue;
  }

  update(
    ownerID: OwnerID | undefined,
    shift: number,
    keyHash: number | undefined,
    key: K,
    value: V | NotSet,
    didChangeSize?: Ref,
    didAlter?: Ref
  ): MapNode<K, V> | undefined {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    const idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
    const removed = isNotSet(value);
    const nodes = this.nodes;
    const node = nodes[idx];

    if (removed && !node) {
      return this;
    }

    const newNode = updateNode(
      node,
      ownerID,
      shift + SHIFT,
      keyHash,
      key,
      value,
      didChangeSize,
      didAlter
    );
    if (newNode === node) {
      return this;
    }

    let newCount = this.count;
    if (!node) {
      newCount++;
    } else if (!newNode) {
      newCount--;
      if (newCount < MIN_HASH_ARRAY_MAP_SIZE) {
        return packNodes(ownerID, nodes, newCount, idx);
      }
    }

    const isEditable = ownerID && ownerID === this.ownerID;
    const newNodes = setAt(nodes, idx, newNode, isEditable);

    if (isEditable) {
      this.count = newCount;
      this.nodes = newNodes;
      return this;
    }

    return new HashArrayMapNode(ownerID, newCount, newNodes);
  }
}

class HashCollisionNode<K, V> implements MapNodeBase<K, V> {
  declare iterate: MapNodeBase<K, V>['iterate'];

  constructor(
    public ownerID: OwnerID | undefined,
    public keyHash: number,
    public entries: Array<MapEntry<K, V>>
  ) {}

  get<NSV>(
    _shift: number,
    _keyHash: number | undefined,
    key: K,
    notSetValue: NSV
  ): V | NSV {
    const entries = this.entries;
    for (let ii = 0, len = entries.length; ii < len; ii++) {
      if (is(key, entries[ii]![0])) {
        return entries[ii]![1];
      }
    }
    return notSetValue;
  }

  update(
    ownerID: OwnerID | undefined,
    shift: number,
    keyHash: number | undefined,
    key: K,
    value: V | NotSet,
    didChangeSize?: Ref,
    didAlter?: Ref
  ): MapNode<K, V> | undefined {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }

    const removed = isNotSet(value);

    if (keyHash !== this.keyHash) {
      if (removed) {
        return this;
      }
      SetRef(didAlter);
      SetRef(didChangeSize);
      return mergeIntoNode(this, ownerID, shift, keyHash, [key, value]);
    }

    const entries = this.entries;
    let idx = 0;
    const len = entries.length;
    for (; idx < len; idx++) {
      if (is(key, entries[idx]![0])) {
        break;
      }
    }
    const exists = idx < len;

    if (exists ? entries[idx]![1] === value : removed) {
      return this;
    }

    SetRef(didAlter);
    (removed || !exists) && SetRef(didChangeSize);

    if (removed && len === 2) {
      return new ValueNode(ownerID, this.keyHash, entries[idx ^ 1]!);
    }

    const isEditable = ownerID && ownerID === this.ownerID;
    const newEntries = isEditable ? entries : arrCopy(entries);

    if (exists) {
      if (removed) {
        idx === len - 1
          ? newEntries.pop()
          : (newEntries[idx] = newEntries.pop()!);
      } else {
        newEntries[idx] = [key, value];
      }
    } else {
      // A missing key with a NOT_SET value returned early above, so this
      // insertion always carries a real V.
      newEntries.push([key, value as V]);
    }

    if (isEditable) {
      this.entries = newEntries;
      return this;
    }

    return new HashCollisionNode(ownerID, this.keyHash, newEntries);
  }
}

class ValueNode<K, V> implements MapNodeBase<K, V> {
  declare iterate: MapNodeBase<K, V>['iterate'];

  constructor(
    public ownerID: OwnerID | undefined,
    public keyHash: number,
    public entry: MapEntry<K, V>
  ) {}

  get<NSV>(
    _shift: number,
    _keyHash: number | undefined,
    key: K,
    notSetValue: NSV
  ): V | NSV {
    return is(key, this.entry[0]) ? this.entry[1] : notSetValue;
  }

  update(
    ownerID: OwnerID | undefined,
    shift: number,
    _keyHash: number | undefined,
    key: K,
    value: V | NotSet,
    didChangeSize?: Ref,
    didAlter?: Ref
  ): MapNode<K, V> | undefined {
    const removed = isNotSet(value);
    const keyMatch = is(key, this.entry[0]);
    if (keyMatch ? value === this.entry[1] : removed) {
      return this;
    }

    SetRef(didAlter);

    if (removed) {
      SetRef(didChangeSize);
      return undefined;
    }

    if (keyMatch) {
      if (ownerID && ownerID === this.ownerID) {
        this.entry[1] = value;
        return this;
      }
      return new ValueNode(ownerID, this.keyHash, [key, value]);
    }

    SetRef(didChangeSize);
    return mergeIntoNode(this, ownerID, shift, hash(key), [key, value]);
  }
}

// #pragma Iterators

// The prototype seam erases the node generics; `unknown` entries are the
// honest view there.
ArrayMapNode.prototype.iterate = HashCollisionNode.prototype.iterate =
  function (
    this: { entries: Array<MapEntry<unknown, unknown>> },
    fn: (entry: MapEntry<unknown, unknown>) => IterationResult,
    reverse?: boolean
  ): boolean | undefined {
    const entries = this.entries;
    for (let ii = 0, maxIndex = entries.length - 1; ii <= maxIndex; ii++) {
      if (fn(entries[reverse ? maxIndex - ii : ii]!) === false) {
        return false;
      }
    }
    return undefined;
  };

BitmapIndexedNode.prototype.iterate = HashArrayMapNode.prototype.iterate =
  function (
    this: { nodes: Array<MapNode<unknown, unknown> | undefined> },
    fn: (entry: MapEntry<unknown, unknown>) => IterationResult,
    reverse?: boolean
  ): boolean | undefined {
    const nodes = this.nodes;
    for (let ii = 0, maxIndex = nodes.length - 1; ii <= maxIndex; ii++) {
      const node = nodes[reverse ? maxIndex - ii : ii];
      if (node && node.iterate(fn, reverse) === false) {
        return false;
      }
    }
    return undefined;
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
ValueNode.prototype.iterate = function (
  this: { entry: MapEntry<unknown, unknown> },
  fn: (entry: MapEntry<unknown, unknown>) => IterationResult,
  _reverse?: boolean
): boolean | undefined {
  return fn(this.entry) === false ? false : undefined;
};

interface MapIteratorFrame<K, V> {
  node: MapNode<K, V>;
  index: number;
  __prev: MapIteratorFrame<K, V> | undefined;
}

class MapIterator<K, V> extends Iterator<IteratorStep<K, V>> {
  _type: IterateType;
  _reverse: boolean | undefined;
  _stack: MapIteratorFrame<K, V> | undefined;

  constructor(map: Map<K, V>, type: IterateType, reverse?: boolean) {
    // No `next` argument: `next` lives on the PROTOTYPE (assigned below),
    // exactly as in 5.0.x — instances carry no own `next`, and a detached
    // `next()` call throws like it always has.
    super();
    this._type = type;
    this._reverse = reverse;
    this._stack = map._root ? mapIteratorFrame(map._root) : undefined;
  }
}

writable(MapIterator.prototype)['next'] = function (
  this: MapIterator<unknown, unknown>
): ImmIteratorResult<IteratorStep<unknown, unknown>> {
  const type = this._type;
  let stack = this._stack;
  while (stack) {
    const node = stack.node;
    const index = stack.index++;
    let maxIndex;
    // The `in` checks discriminate the MapNode union by each kind's payload
    // member (always present and truthy on the kinds that declare it):
    // ValueNode carries `entry`, ArrayMapNode/HashCollisionNode carry
    // `entries`, BitmapIndexedNode/HashArrayMapNode carry `nodes`.
    if ('entry' in node) {
      if (index === 0) {
        return mapIteratorValue(type, node.entry);
      }
    } else if ('entries' in node) {
      maxIndex = node.entries.length - 1;
      if (index <= maxIndex) {
        return mapIteratorValue(
          type,
          node.entries[this._reverse ? maxIndex - index : index]!
        );
      }
    } else {
      const nodes = node.nodes;
      maxIndex = nodes.length - 1;
      if (index <= maxIndex) {
        const subNode = nodes[this._reverse ? maxIndex - index : index];
        if (subNode) {
          if ('entry' in subNode) {
            return mapIteratorValue(type, subNode.entry);
          }
          stack = this._stack = mapIteratorFrame(subNode, stack);
        }
        continue;
      }
    }
    stack = this._stack = stack.__prev;
  }
  return iteratorDone();
};

function mapIteratorValue<K, V>(
  type: IterateType,
  entry: MapEntry<K, V>
): ImmIteratorResult<IteratorStep<K, V>> {
  return iteratorValue(type, entry[0], entry[1]);
}

function mapIteratorFrame<K, V>(
  node: MapNode<K, V>,
  prev?: MapIteratorFrame<K, V>
): MapIteratorFrame<K, V> {
  return {
    node: node,
    index: 0,
    __prev: prev,
  };
}

function makeMap<K, V>(
  size: number,
  root?: MapNode<K, V> | null,
  ownerID?: OwnerID,
  hash?: number | undefined
): Map<K, V> {
  const map: Map<K, V> = Object.create(MapPrototype);
  map.size = size;
  map._root = root ?? null;
  map.__ownerID = ownerID;
  map.__hash = hash;
  map.__altered = false;
  return map;
}

let EMPTY_MAP: Map<unknown, unknown> | undefined;
export function emptyMap<K, V>(): Map<K, V> {
  const empty = EMPTY_MAP || (EMPTY_MAP = makeMap<unknown, unknown>(0));
  // `Map` is invariant in its type params; the shared empty map is a valid
  // `Map<K, V>` for any K/V (it has no entries), and generics are erased.
  return empty as Map<K, V>;
}

function updateMap<K, V>(map: Map<K, V>, k: K, v: V | NotSet): Map<K, V> {
  let newRoot: MapNode<K, V> | null | undefined;
  let newSize: number;
  if (!map._root) {
    if (isNotSet(v)) {
      return map;
    }
    newSize = 1;
    newRoot = new ArrayMapNode(map.__ownerID, [[k, v]]);
  } else {
    const didChangeSize = MakeRef();
    const didAlter = MakeRef();
    newRoot = updateNode(
      map._root,
      map.__ownerID,
      0,
      undefined,
      k,
      v,
      didChangeSize,
      didAlter
    );
    if (!didAlter.value) {
      return map;
    }
    newSize = map.size + (didChangeSize.value ? (isNotSet(v) ? -1 : 1) : 0);
  }
  if (map.__ownerID) {
    map.size = newSize;
    map._root = newRoot ?? null;
    map.__hash = undefined;
    map.__altered = true;
    return map;
  }
  return newRoot ? makeMap(newSize, newRoot) : emptyMap();
}

function updateNode<K, V>(
  node: MapNode<K, V> | undefined,
  ownerID: OwnerID | undefined,
  shift: number,
  keyHash: number | undefined,
  key: K,
  value: V | NotSet,
  didChangeSize?: Ref,
  didAlter?: Ref
): MapNode<K, V> | undefined {
  if (!node) {
    if (isNotSet(value)) {
      return node;
    }
    SetRef(didAlter);
    SetRef(didChangeSize);
    // `keyHash` is a number here: every caller that passes an absent node
    // (BitmapIndexedNode.update, HashArrayMapNode.update) computes the hash
    // before recursing.
    return new ValueNode(ownerID, keyHash as number, [key, value]);
  }
  return node.update(
    ownerID,
    shift,
    keyHash,
    key,
    value,
    didChangeSize,
    didAlter
  );
}

function isLeafNode(node: MapNode<unknown, unknown>): boolean {
  return (
    node.constructor === ValueNode || node.constructor === HashCollisionNode
  );
}

function mergeIntoNode<K, V>(
  node: ValueNode<K, V> | HashCollisionNode<K, V>,
  ownerID: OwnerID | undefined,
  shift: number,
  keyHash: number,
  entry: MapEntry<K, V>
): MapNode<K, V> {
  const nodeKeyHash = node.keyHash;
  if (nodeKeyHash === keyHash) {
    // Equal hash implies `node` is a ValueNode: the only HashCollisionNode
    // caller (HashCollisionNode.update) reaches here exclusively when
    // `keyHash !== this.keyHash`.
    return new HashCollisionNode(ownerID, keyHash, [
      (node as ValueNode<K, V>).entry,
      entry,
    ]);
  }

  const idx1 = (shift === 0 ? nodeKeyHash : nodeKeyHash >>> shift) & MASK;
  const idx2 = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;

  let newNode;
  const nodes: Array<MapNode<K, V>> =
    idx1 === idx2
      ? [mergeIntoNode(node, ownerID, shift + SHIFT, keyHash, entry)]
      : ((newNode = new ValueNode(ownerID, keyHash, entry)),
        idx1 < idx2 ? [node, newNode] : [newNode, node]);

  return new BitmapIndexedNode(ownerID, (1 << idx1) | (1 << idx2), nodes);
}

function createNodes<K, V>(
  ownerID: OwnerID | undefined,
  entries: Array<MapEntry<K, V>>,
  key: K,
  value: V
): MapNode<K, V> {
  if (!ownerID) {
    ownerID = new OwnerID();
  }
  let node: MapNode<K, V> = new ValueNode(ownerID, hash(key), [key, value]);
  for (let ii = 0; ii < entries.length; ii++) {
    const entry = entries[ii]!;
    // Never undefined: `update` returns undefined only when REMOVING
    // (value === NOT_SET), and `entry[1]` is a real stored value.
    node = node.update(ownerID, 0, undefined, entry[0], entry[1]) as MapNode<
      K,
      V
    >;
  }
  return node;
}

function packNodes<K, V>(
  ownerID: OwnerID | undefined,
  nodes: Array<MapNode<K, V> | undefined>,
  count: number,
  excluding: number
): MapNode<K, V> {
  let bitmap = 0;
  let packedII = 0;
  const packedNodes: Array<MapNode<K, V> | undefined> = new Array(count);
  for (let ii = 0, bit = 1, len = nodes.length; ii < len; ii++, bit <<= 1) {
    const node = nodes[ii];
    if (node !== undefined && ii !== excluding) {
      bitmap |= bit;
      packedNodes[packedII++] = node;
    }
  }
  return new BitmapIndexedNode(ownerID, bitmap, packedNodes);
}

function expandNodes<K, V>(
  ownerID: OwnerID | undefined,
  nodes: Array<MapNode<K, V> | undefined>,
  bitmap: number,
  including: number,
  node: MapNode<K, V>
): MapNode<K, V> {
  let count = 0;
  const expandedNodes: Array<MapNode<K, V> | undefined> = new Array(SIZE);
  for (let ii = 0; bitmap !== 0; ii++, bitmap >>>= 1) {
    expandedNodes[ii] = bitmap & 1 ? nodes[count++] : undefined;
  }
  expandedNodes[including] = node;
  return new HashArrayMapNode(ownerID, count + 1, expandedNodes);
}

function popCount(x: number): number {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  x += x >> 8;
  x += x >> 16;
  return x & 0x7f;
}

function setAt<T>(
  array: Array<T>,
  idx: number,
  val: T,
  canEdit: boolean | undefined
): Array<T> {
  const newArray = canEdit ? array : arrCopy(array);
  newArray[idx] = val;
  return newArray;
}

function spliceIn<T>(
  array: Array<T>,
  idx: number,
  val: T,
  canEdit: boolean | undefined
): Array<T> {
  const newLen = array.length + 1;
  if (canEdit && idx + 1 === newLen) {
    array[idx] = val;
    return array;
  }
  const newArray: Array<T> = new Array(newLen);
  let after = 0;
  for (let ii = 0; ii < newLen; ii++) {
    if (ii === idx) {
      newArray[ii] = val;
      after = -1;
    } else {
      newArray[ii] = array[ii + after]!;
    }
  }
  return newArray;
}

function spliceOut<T>(
  array: Array<T>,
  idx: number,
  canEdit: boolean | undefined
): Array<T> {
  const newLen = array.length - 1;
  if (canEdit && idx === newLen) {
    array.pop();
    return array;
  }
  const newArray: Array<T> = new Array(newLen);
  let after = 0;
  for (let ii = 0; ii < newLen; ii++) {
    if (ii === idx) {
      after = 1;
    }
    newArray[ii] = array[ii + after]!;
  }
  return newArray;
}

const MAX_ARRAY_MAP_SIZE = SIZE / 4;
const MAX_BITMAP_INDEXED_SIZE = SIZE / 2;
const MIN_HASH_ARRAY_MAP_SIZE = SIZE / 4;
