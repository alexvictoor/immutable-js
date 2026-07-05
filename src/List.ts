import {
  CONSTRUCT,
  DELETE,
  SHIFT,
  SIZE,
  MASK,
  OwnerID,
  MakeRef,
  SetRef,
  wrapIndex,
  wholeSlice,
  resolveBegin,
  resolveEnd,
} from './TrieUtils';
import { IS_LIST_SYMBOL, isList } from './predicates/isList';
import { IndexedCollection } from './Collection';
import { hasIterator, Iterator, iteratorValue, iteratorDone } from './Iterator';
import { setIn } from './methods/setIn';
import { deleteIn } from './methods/deleteIn';
import { update } from './methods/update';
import { updateIn } from './methods/updateIn';
import { mergeIn } from './methods/mergeIn';
import { mergeDeepIn } from './methods/mergeDeepIn';
import { withMutations } from './methods/withMutations';
import { asMutable } from './methods/asMutable';
import { asImmutable } from './methods/asImmutable';
import { wasAltered } from './methods/wasAltered';
import assertNotInfinite from './utils/assertNotInfinite';
import { reparam, writable } from './utils/reinterpret';
import type { ThisArg } from './Operations';
import type {
  IterateType,
  ImmutableIterator,
  IteratorStep,
  Ref,
  SideEffect,
} from './internalTypes';

// A trie node. Its `array` holds child VNodes (interior levels) or leaf values
// (level 0); `undefined` marks unset slots. Levels are only distinguished at
// runtime, so reads narrow the union with a cast guided by `level`.
class VNode<T> {
  array: Array<T | VNode<T> | undefined>;
  ownerID: OwnerID | undefined;

  constructor(array: Array<T | VNode<T> | undefined>, ownerID?: OwnerID) {
    this.array = array;
    this.ownerID = ownerID;
  }

  // TODO: seems like these methods are very similar

  removeBefore(
    ownerID: OwnerID | undefined,
    level: number,
    index: number
  ): VNode<T> {
    if (
      (index & ((1 << (level + SHIFT)) - 1)) === 0 ||
      this.array.length === 0
    ) {
      return this;
    }
    const originIndex = (index >>> level) & MASK;
    if (originIndex >= this.array.length) {
      return new VNode([], ownerID);
    }
    const removingFirst = originIndex === 0;
    let newChild: VNode<T> | undefined;
    if (level > 0) {
      // level > 0: interior node, children are VNodes.
      const oldChild = this.array[originIndex] as VNode<T> | undefined;
      newChild =
        oldChild && oldChild.removeBefore(ownerID, level - SHIFT, index);
      if (newChild === oldChild && removingFirst) {
        return this;
      }
    }
    if (removingFirst && !newChild) {
      return this;
    }
    const editable = editableVNode(this, ownerID);
    if (!removingFirst) {
      for (let ii = 0; ii < originIndex; ii++) {
        editable.array[ii] = undefined;
      }
    }
    if (newChild) {
      editable.array[originIndex] = newChild;
    }
    return editable;
  }

  removeAfter(
    ownerID: OwnerID | undefined,
    level: number,
    index: number
  ): VNode<T> {
    if (
      index === (level ? 1 << (level + SHIFT) : SIZE) ||
      this.array.length === 0
    ) {
      return this;
    }
    const sizeIndex = ((index - 1) >>> level) & MASK;
    if (sizeIndex >= this.array.length) {
      return this;
    }

    let newChild: VNode<T> | undefined;
    if (level > 0) {
      // level > 0: interior node, children are VNodes.
      const oldChild = this.array[sizeIndex] as VNode<T> | undefined;
      newChild =
        oldChild && oldChild.removeAfter(ownerID, level - SHIFT, index);
      if (newChild === oldChild && sizeIndex === this.array.length - 1) {
        return this;
      }
    }

    const editable = editableVNode(this, ownerID);
    editable.array.splice(sizeIndex + 1);
    if (newChild) {
      editable.array[sizeIndex] = newChild;
    }
    return editable;
  }
}

export interface List<T> extends IndexedCollection<T> {
  size: number;
  [IS_LIST_SYMBOL]: true;
  _origin: number;
  _capacity: number;
  _level: number;
  _root: VNode<T> | null | undefined;
  _tail: VNode<T> | null | undefined;

  // Attached on the prototype below; declared because List.ts's own methods
  // call them. The rest of the public API is inherited via the base class.
  withMutations(mutator: (mutable: this) => unknown): this;
  wasAltered(): boolean;
  asImmutable(): this;
  asMutable(): this;
}
export class List<T> extends IndexedCollection<T> {
  declare static isList: typeof isList;

  // @pragma Construction

  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const empty = emptyList<T>();
    let result: unknown;
    if (value === undefined || value === null) {
      result = empty;
    } else if (isList(value)) {
      result = value;
    } else {
      const iter = new IndexedCollection<T>(value);
      const size = iter.size;
      if (size === 0) {
        result = empty;
      } else {
        assertNotInfinite(size);
        if (size !== undefined && size > 0 && size < SIZE) {
          result = makeList(0, size, SHIFT, null, new VNode(iter.toArray()));
        } else {
          result = empty.withMutations(list => {
            list.setSize(size as number);
            iter.forEach((v: T, i: number) => list.set(i, v));
          });
        }
      }
    }
    // eslint-disable-next-line no-constructor-return
    return result as List<T>;
  }

  static of<T>(...values: Array<T>): List<T>;
  static of(): List<unknown> {
    // eslint-disable-next-line prefer-rest-params
    return new this(arguments);
  }

  toString(): string {
    return this.__toString('List [', ']');
  }

  // @pragma Access

  get(index: number): T | undefined;
  get<NSV>(index: number, notSetValue: NSV): T | NSV;
  get<NSV>(index: number, notSetValue?: NSV): T | NSV | undefined {
    index = wrapIndex(this, index);
    if (index >= 0 && index < this.size) {
      index += this._origin;
      const node = listNodeFor(this, index);
      // The looked-up node is a leaf (level 0), so the slot holds a T.
      return (node && node.array[index & MASK]) as T | undefined;
    }
    return notSetValue;
  }

  // @pragma Modification

  set(index: number, value: T): List<T> {
    return updateList(this, index, value);
  }

  remove(index: number): List<T> {
    return !this.has(index)
      ? this
      : index === 0
      ? this.shift()
      : index === this.size - 1
      ? this.pop()
      : this.splice(index, 1);
  }

  insert(index: number, value: T): List<T> {
    return this.splice(index, 0, value);
  }

  clear(): List<T> {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = this._origin = this._capacity = 0;
      this._level = SHIFT;
      this._root = this._tail = this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyList();
  }

  // Implemented via `arguments` (not a rest param) so the ES5 output does not
  // allocate+copy an array on every call — this is a hot path.
  push(...values: Array<T>): List<T>;
  push(): List<T> {
    // eslint-disable-next-line prefer-rest-params
    const values = arguments as ArrayLike<T>;
    const oldSize = this.size;
    return this.withMutations(list => {
      setListBounds(list, 0, oldSize + values.length);
      for (let ii = 0; ii < values.length; ii++) {
        list.set(oldSize + ii, values[ii]!);
      }
    });
  }

  pop(): List<T> {
    return setListBounds(this, 0, -1);
  }

  unshift(...values: Array<T>): List<T>;
  unshift(): List<T> {
    // eslint-disable-next-line prefer-rest-params
    const values = arguments as ArrayLike<T>;
    return this.withMutations(list => {
      setListBounds(list, -values.length);
      for (let ii = 0; ii < values.length; ii++) {
        list.set(ii, values[ii]!);
      }
    });
  }

  shift(): List<T> {
    return setListBounds(this, 1);
  }

  // @pragma Composition

  concat(...collections: Array<unknown>): List<T> {
    const seqs: Array<IndexedCollection<unknown>> = [];
    for (let i = 0; i < collections.length; i++) {
      const argument = collections[i];
      const seq = new IndexedCollection<unknown>(
        typeof argument !== 'string' && hasIterator(argument)
          ? (argument as Iterable<unknown>)
          : [argument]
      );
      if (seq.size !== 0) {
        seqs.push(seq);
      }
    }
    if (seqs.length === 0) {
      return this;
    }
    if (this.size === 0 && !this.__ownerID && seqs.length === 1) {
      // Called without `new` to match the original factory-coercion semantics.
      return (this.constructor as (value: unknown) => List<T>)(seqs[0]);
    }
    return this.withMutations(list => {
      seqs.forEach(seq => seq.forEach(value => list.push(value as T)));
    });
  }

  setSize(size: number): List<T> {
    return setListBounds(this, 0, size);
  }

  map<M>(
    mapper: (value: T, key: number, iter: this) => M,
    context?: ThisArg
  ): List<M> {
    const result = this.withMutations(list => {
      // While mutating in place the list transiently holds both original and
      // mapped values.
      const l = reparam<List<T | M>>(list);
      for (let i = 0; i < this.size; i++) {
        l.set(i, mapper.call(context, l.get(i) as T, i, this));
      }
    });
    return reparam<List<M>>(result);
  }

  // @pragma Iteration

  slice(begin?: number, end?: number): this {
    const size = this.size;
    if (wholeSlice(begin, end, size)) {
      return this;
    }
    return setListBounds(
      this,
      resolveBegin(begin, size),
      resolveEnd(end, size)
    ) as this;
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<number, T>> {
    let index = reverse ? this.size : 0;
    const values = iterateList(this, reverse);
    return new Iterator(() => {
      const value = values();
      return isDone(value)
        ? iteratorDone()
        : iteratorValue(type, reverse ? --index : index++, value);
    });
  }

  __iterate(fn: SideEffect<number, T, unknown>, reverse?: boolean): number {
    let index = reverse ? this.size : 0;
    const values = iterateList(this, reverse);
    while (true) {
      const value = values();
      if (isDone(value)) {
        break;
      }
      // Holes yield real `undefined` into the callback (long-shipped
      // behavior); the cast admits that through `SideEffect`'s `T`.
      if (fn(value as T, reverse ? --index : index++, this) === false) {
        break;
      }
    }
    return index;
  }

  __ensureOwner(ownerID: OwnerID | undefined): this {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      if (this.size === 0) {
        return emptyList() as this;
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeList(
      this._origin,
      this._capacity,
      this._level,
      this._root,
      this._tail,
      ownerID,
      this.__hash
    ) as this;
  }
}

List.isList = isList;

const ListPrototype = List.prototype;
const writableProto = writable(ListPrototype);
ListPrototype[IS_LIST_SYMBOL] = true;
writableProto[DELETE] = ListPrototype.remove;
writableProto['merge'] = ListPrototype.concat;
writableProto['setIn'] = setIn;
writableProto['deleteIn'] = writableProto['removeIn'] = deleteIn;
writableProto['update'] = update;
writableProto['updateIn'] = updateIn;
writableProto['mergeIn'] = mergeIn;
writableProto['mergeDeepIn'] = mergeDeepIn;
writableProto['withMutations'] = withMutations;
writableProto['wasAltered'] = wasAltered;
writableProto['asImmutable'] = asImmutable;
writableProto['@@transducer/init'] = writableProto['asMutable'] = asMutable;
writableProto['@@transducer/step'] = function (
  result: List<unknown>,
  arr: unknown
) {
  return result.push(arr);
};
writableProto['@@transducer/result'] = function (obj: List<unknown>) {
  return obj.asImmutable();
};

// Iteration-exhausted sentinel, branded like NOT_SET/CONSTRUCT (TrieUtils)
// so the step functions can yield `ListStep<T>` instead of erasing to
// `unknown`.
declare const DONE_BRAND: unique symbol;
type Done = { readonly [DONE_BRAND]: true };
const DONE = {} as Done;

function isDone(value: unknown): value is Done {
  return value === DONE;
}

// A step yields a leaf value, `undefined` for a hole (Lists mark unset
// entries that way — holes reach the callbacks as real `undefined`s), or the
// DONE sentinel once exhausted.
type ListStep<T> = T | undefined | Done;

function iterateList<T>(list: List<T>, reverse?: boolean): () => ListStep<T> {
  const left = list._origin;
  const right = list._capacity;
  const tailPos = getTailOffset(right);
  const tail = list._tail;

  return iterateNodeOrLeaf(list._root, list._level, 0);

  function iterateNodeOrLeaf(
    node: VNode<T> | null | undefined,
    level: number,
    offset: number
  ): () => ListStep<T> {
    return level === 0
      ? iterateLeaf(node, offset)
      : iterateNode(node, level, offset);
  }

  function iterateLeaf(
    node: VNode<T> | null | undefined,
    offset: number
  ): () => ListStep<T> {
    const array = offset === tailPos ? tail && tail.array : node && node.array;
    let from = offset > left ? 0 : left - offset;
    let to = right - offset;
    if (to > SIZE) {
      to = SIZE;
    }
    return () => {
      if (from === to) {
        return DONE;
      }
      const idx = reverse ? --to : from++;
      // Level 0 here: leaf cells hold values or holes (and an absent array
      // reads every cell as a hole).
      return (array && array[idx]) as T | undefined;
    };
  }

  function iterateNode(
    node: VNode<T> | null | undefined,
    level: number,
    offset: number
  ): () => ListStep<T> {
    let values: (() => ListStep<T>) | null;
    const array = node && node.array;
    let from = offset > left ? 0 : (left - offset) >> level;
    let to = ((right - offset) >> level) + 1;
    if (to > SIZE) {
      to = SIZE;
    }
    return () => {
      while (true) {
        if (values) {
          const value = values();
          if (!isDone(value)) {
            return value;
          }
          values = null;
        }
        if (from === to) {
          return DONE;
        }
        const idx = reverse ? --to : from++;
        values = iterateNodeOrLeaf(
          // level > 0 here: children are VNodes.
          (array && array[idx]) as VNode<T> | null | undefined,
          level - SHIFT,
          offset + (idx << level)
        );
      }
    };
  }
}

function makeList<T>(
  origin: number,
  capacity: number,
  level: number,
  root?: VNode<T> | null,
  tail?: VNode<T> | null,
  ownerID?: OwnerID,
  hash?: number | undefined
): List<T> {
  const list: List<T> = Object.create(ListPrototype);
  list.size = capacity - origin;
  list._origin = origin;
  list._capacity = capacity;
  list._level = level;
  list._root = root;
  list._tail = tail;
  list.__ownerID = ownerID;
  list.__hash = hash;
  list.__altered = false;
  return list;
}

export function emptyList<T>(): List<T> {
  return makeList<T>(0, 0, SHIFT);
}

function updateList<T>(list: List<T>, index: number, value: T): List<T> {
  index = wrapIndex(list, index);

  if (index !== index) {
    return list;
  }

  if (index >= list.size || index < 0) {
    return list.withMutations(mutable => {
      index < 0
        ? setListBounds(mutable, index).set(0, value)
        : setListBounds(mutable, 0, index + 1).set(index, value);
    });
  }

  index += list._origin;

  let newTail = list._tail;
  let newRoot = list._root;
  const didAlter = MakeRef();
  if (index >= getTailOffset(list._capacity)) {
    newTail = updateVNode(newTail, list.__ownerID, 0, index, value, didAlter);
  } else {
    newRoot = updateVNode(
      newRoot,
      list.__ownerID,
      list._level,
      index,
      value,
      didAlter
    );
  }

  if (!didAlter.value) {
    return list;
  }

  if (list.__ownerID) {
    list._root = newRoot;
    list._tail = newTail;
    list.__hash = undefined;
    list.__altered = true;
    return list;
  }
  return makeList(list._origin, list._capacity, list._level, newRoot, newTail);
}

function updateVNode<T>(
  node: VNode<T> | null | undefined,
  ownerID: OwnerID | undefined,
  level: number,
  index: number,
  // `undefined` clears the slot (Lists mark unset entries that way).
  value: T | undefined,
  didAlter?: Ref
  // Nullable: clearing a slot whose subtree does not exist returns the
  // (possibly absent) node unchanged. Callers store into nullable slots.
): VNode<T> | null | undefined {
  const idx = (index >>> level) & MASK;
  const nodeHas = node && idx < node.array.length;
  if (!nodeHas && value === undefined) {
    return node;
  }

  let newNode: VNode<T>;

  if (level > 0) {
    // level > 0: interior node, children are VNodes.
    const lowerNode = node && (node.array[idx] as VNode<T> | undefined);
    const newLowerNode = updateVNode(
      lowerNode,
      ownerID,
      level - SHIFT,
      index,
      value,
      didAlter
    );
    if (newLowerNode === lowerNode) {
      return node;
    }
    newNode = editableVNode(node, ownerID);
    // A child that CHANGED is always a freshly built node: the recursion
    // returns null/undefined only on paths that hand back `lowerNode` itself,
    // which the identity check above already returned on.
    newNode.array[idx] = newLowerNode!;
    return newNode;
  }

  if (nodeHas && node!.array[idx] === value) {
    return node;
  }

  if (didAlter) {
    SetRef(didAlter);
  }

  newNode = editableVNode(node, ownerID);
  if (value === undefined && idx === newNode.array.length - 1) {
    newNode.array.pop();
  } else {
    newNode.array[idx] = value;
  }
  return newNode;
}

function editableVNode<T>(
  node: VNode<T> | null | undefined,
  ownerID: OwnerID | undefined
): VNode<T> {
  if (ownerID && node && ownerID === node.ownerID) {
    return node;
  }
  return new VNode(node ? node.array.slice() : [], ownerID);
}

function listNodeFor<T>(
  list: List<T>,
  rawIndex: number
): VNode<T> | null | undefined {
  if (rawIndex >= getTailOffset(list._capacity)) {
    return list._tail;
  }
  if (rawIndex < 1 << (list._level + SHIFT)) {
    let node = list._root;
    let level = list._level;
    while (node && level > 0) {
      // level > 0: interior node, children are VNodes.
      node = node.array[(rawIndex >>> level) & MASK] as VNode<T> | undefined;
      level -= SHIFT;
    }
    return node;
  }
  return undefined;
}

function setListBounds<T>(
  list: List<T>,
  begin?: number,
  end?: number
): List<T> {
  // Sanitize begin & end using this shorthand for ToInt32(argument)
  // http://www.ecma-international.org/ecma-262/6.0/#sec-toint32
  if (begin !== undefined) {
    begin |= 0;
  }
  if (end !== undefined) {
    end |= 0;
  }
  const owner = list.__ownerID || new OwnerID();
  let oldOrigin = list._origin;
  let oldCapacity = list._capacity;
  let newOrigin = oldOrigin + (begin as number);
  let newCapacity =
    end === undefined
      ? oldCapacity
      : end < 0
      ? oldCapacity + end
      : oldOrigin + end;
  if (newOrigin === oldOrigin && newCapacity === oldCapacity) {
    return list;
  }

  // If it's going to end after it starts, it's empty.
  if (newOrigin >= newCapacity) {
    return list.clear();
  }

  let newLevel = list._level;
  let newRoot = list._root;

  // New origin might need creating a higher root.
  let offsetShift = 0;
  while (newOrigin + offsetShift < 0) {
    newRoot = new VNode(
      newRoot && newRoot.array.length ? [undefined, newRoot] : [],
      owner
    );
    newLevel += SHIFT;
    offsetShift += 1 << newLevel;
  }
  if (offsetShift) {
    newOrigin += offsetShift;
    oldOrigin += offsetShift;
    newCapacity += offsetShift;
    oldCapacity += offsetShift;
  }

  const oldTailOffset = getTailOffset(oldCapacity);
  const newTailOffset = getTailOffset(newCapacity);

  // New size might need creating a higher root.
  while (newTailOffset >= 1 << (newLevel + SHIFT)) {
    newRoot = new VNode(
      newRoot && newRoot.array.length ? [newRoot] : [],
      owner
    );
    newLevel += SHIFT;
  }

  // Locate or create the new tail.
  const oldTail = list._tail;
  let newTail =
    newTailOffset < oldTailOffset
      ? listNodeFor(list, newCapacity - 1)
      : newTailOffset > oldTailOffset
      ? new VNode([], owner)
      : oldTail;

  // Merge Tail into tree.
  if (
    oldTail &&
    newTailOffset > oldTailOffset &&
    newOrigin < oldCapacity &&
    oldTail.array.length
  ) {
    newRoot = editableVNode(newRoot, owner);
    let node = newRoot;
    for (let level = newLevel; level > SHIFT; level -= SHIFT) {
      const idx = (oldTailOffset >>> level) & MASK;
      node = node.array[idx] = editableVNode(
        // level > SHIFT: interior node, children are VNodes.
        node.array[idx] as VNode<T> | undefined,
        owner
      );
    }
    node.array[(oldTailOffset >>> SHIFT) & MASK] = oldTail;
  }

  // If the size has been reduced, there's a chance the tail needs to be trimmed.
  if (newCapacity < oldCapacity) {
    newTail = newTail && newTail.removeAfter(owner, 0, newCapacity);
  }

  // If the new origin is within the tail, then we do not need a root.
  if (newOrigin >= newTailOffset) {
    newOrigin -= newTailOffset;
    newCapacity -= newTailOffset;
    newLevel = SHIFT;
    newRoot = null;
    newTail = newTail && newTail.removeBefore(owner, 0, newOrigin);

    // Otherwise, if the root has been trimmed, garbage collect.
  } else if (newOrigin > oldOrigin || newTailOffset < oldTailOffset) {
    offsetShift = 0;

    // Identify the new top root node of the subtree of the old root.
    while (newRoot) {
      const beginIndex = (newOrigin >>> newLevel) & MASK;
      // Faithful to 5.0.x, which reads `(beginIndex !== x >>> newLevel) &
      // MASK`: the comparison binds FIRST, so the `& MASK` applies to the
      // boolean (1|0) and is a no-op — almost certainly an upstream typo for
      // `beginIndex !== ((x >>> newLevel) & MASK)`, but "fixing" it would
      // change which subtrees get collected. Do not simplify.
      if ((beginIndex !== newTailOffset >>> newLevel ? 1 : 0) & MASK) {
        break;
      }
      if (beginIndex) {
        offsetShift += (1 << newLevel) * beginIndex;
      }
      newLevel -= SHIFT;
      // Above the leaf level here: children are VNodes.
      newRoot = newRoot.array[beginIndex] as VNode<T> | null | undefined;
    }

    // Trim the new sides of the new root.
    if (newRoot && newOrigin > oldOrigin) {
      newRoot = newRoot.removeBefore(owner, newLevel, newOrigin - offsetShift);
    }
    if (newRoot && newTailOffset < oldTailOffset) {
      newRoot = newRoot.removeAfter(
        owner,
        newLevel,
        newTailOffset - offsetShift
      );
    }
    if (offsetShift) {
      newOrigin -= offsetShift;
      newCapacity -= offsetShift;
    }
  }

  if (list.__ownerID) {
    list.size = newCapacity - newOrigin;
    list._origin = newOrigin;
    list._capacity = newCapacity;
    list._level = newLevel;
    list._root = newRoot;
    list._tail = newTail;
    list.__hash = undefined;
    list.__altered = true;
    return list;
  }
  return makeList(newOrigin, newCapacity, newLevel, newRoot, newTail);
}

function getTailOffset(size: number): number {
  return size < SIZE ? 0 : ((size - 1) >>> SHIFT) << SHIFT;
}
