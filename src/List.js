// @ts-check
/** @import * as Immutable from '../type-definitions/immutable'*/
import {
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
import { IndexedCollectionImpl, IndexedCollection } from './Collection';
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

/**
 * @template T
 * @typedef  {ReturnType<typeof Immutable.List<T>>} ImmutableList<T>
 */

/**
 * @type  {typeof Immutable.List}
 */
export const List = (value) => {
  const empty = emptyList();
  if (value === undefined || value === null) {
    return empty;
  }
  if (isList(value)) {
    return value;
  }
  const iter = IndexedCollection(value);
  const size = iter.size;
  if (size === 0) {
    return empty;
  }
  assertNotInfinite(size);
  if (size > 0 && size < SIZE) {
    return new ListImpl(0, size, SHIFT, null, new VNode(iter.toArray()));
  }
  // @ts-ignore
  return empty.withMutations((list) => {
    list.setSize(size);
    iter.forEach((v, i) => list.set(i, v));
  });
};

List.of = function (/*...values*/) {
  return List(arguments);
};

/**
 * @template T
 */
export class ListImpl extends IndexedCollectionImpl {
  // @pragma Construction

  /**
   * @param {number} origin
   * @param {number} capacity
   * @param {number} level
   * @param {VNode<T> | null} [root]
   * @param {VNode<T> | null} [tail]
   * @param {unknown} [ownerID]
   * @param {number} [hash]
   */
  constructor(origin, capacity, level, root, tail, ownerID, hash) {
    super();
    this.size = capacity - origin;
    this._origin = origin;
    this._capacity = capacity;
    this._level = level;
    this._root = root;
    this._tail = tail;
    this.__ownerID = ownerID;
    this.__hash = hash;
    this.__altered = false;
  }

  /**
   * Creates a new list from the given value
   * @param {Iterable<T> | ArrayLike<T>} [value] - The value to create a list from
   * @returns {ImmutableList<T>} A new list
   */
  create(value) {
    return List(value);
  }

  /**
   * @returns {string} String representation of the list
   */
  toString() {
    // @ts-ignore
    return this.__toString('List [', ']');
  }

  // @pragma Access

  /**
   * @param {number} index
   * @param {T} [notSetValue]
   * @returns {T | undefined}
   */
  get(index, notSetValue) {
    index = wrapIndex(this, index);
    if (index >= 0 && index < this.size) {
      index += this._origin;
      const node = listNodeFor(this, index);
      // @ts-ignore
      return node && node.array[index & MASK];
    }
    return notSetValue;
  }

  /**
   * @param {number} index - The index to check
   * @returns {boolean} True if the index exists in the list
   */
  has(index) {
    index = wrapIndex(this, index);
    return index >= 0 && index < this.size;
  }

  // @pragma Modification

  /**
   * @param {number} index
   * @param {T} value
   * @returns {ListImpl<T>}
   */
  set(index, value) {
    return updateList(this, index, value);
  }

  /**
   *
   * @param {number} index
   * @returns {ListImpl<T>}
   */
  remove(index) {
    return !this.has(index)
      ? this
      : index === 0
        ? this.shift()
        : index === this.size - 1
          ? this.pop()
          : this.splice(index, 1);
  }

  /**
   *
   * @param {number} index
   * @param {T} value
   * @returns {ListImpl<T>}
   */
  insert(index, value) {
    return this.splice(index, 0, value);
  }

  /**
   * @param {number} index - The starting index
   * @param {number} removeNum - Number of elements to remove
   * @param {...T} values - Values to insert
   * @returns {ListImpl<T>} A new list with the splice operation applied
   */
  splice(index, removeNum, ...values) {
    index = wrapIndex(this, index);
    if (index < 0) {
      index = this.size + index;
    }
    if (index < 0) {
      index = 0;
    }
    if (index > this.size) {
      index = this.size;
    }

    const oldSize = this.size;
    const newSize = oldSize + values.length - removeNum;

    if (newSize < 0) {
      return this;
    }

    if (newSize === 0) {
      return this.clear();
    }

    if (this.__ownerID) {
      this.size = newSize;
      this._origin = 0;
      this._capacity = newSize;
      this._level = SHIFT;
      this._root = this._tail = this.__hash = undefined;
      this.__altered = true;
      return this;
    }

    // @ts-ignore
    return this.withMutations((list) => {
      setListBounds(list, 0, newSize);
      for (let i = 0; i < index; i++) {
        list.set(i, this.get(i));
      }
      for (let i = 0; i < values.length; i++) {
        list.set(index + i, values[i]);
      }
      for (let i = index + values.length; i < oldSize; i++) {
        list.set(i, this.get(i));
      }
    });
  }

  /**
   *
   * @returns {ListImpl<T>}
   */
  clear() {
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

  /**
   * @param {...T} values
   * @returns {ImmutableList<T>}
   */
  push(/*...values*/) {
    const values = arguments;
    const oldSize = this.size;
    // @ts-ignore
    return this.withMutations((list) => {
      setListBounds(list, 0, oldSize + values.length);
      for (let ii = 0; ii < values.length; ii++) {
        list.set(oldSize + ii, values[ii]);
      }
    });
  }

  /**
   *
   * @returns {ListImpl<T>}
   */
  pop() {
    return setListBounds(this, 0, -1);
  }

  /**
   * @param {...T} values
   * @returns {ImmutableList<T>}
   */
  unshift(/*...values*/) {
    const values = arguments;

    // @ts-ignore
    return this.withMutations((list) => {
      setListBounds(list, -values.length);
      for (let ii = 0; ii < values.length; ii++) {
        list.set(ii, values[ii]);
      }
    });
  }

  /**
   *
   * @returns {ListImpl<T>}
   */
  shift() {
    return setListBounds(this, 1);
  }

  // @pragma Composition


  concat(/*...collections*/) {
    /**
     * @type {Array<ReturnType<typeof IndexedCollection<T>>>}
     */
    const seqs = [];
    for (let i = 0; i < arguments.length; i++) {
      const argument = arguments[i];
      const seq = IndexedCollection(
        typeof argument !== 'string' && hasIterator(argument)
          ? argument
          : [argument]
      );
      if (seq.size !== 0) {
        seqs.push(seq);
      }
    }
    if (seqs.length === 0) {
      // @ts-ignore
      return this;
    }
    if (this.size === 0 && !this.__ownerID && seqs.length === 1) {
      return List(seqs[0]);
    }
    // @ts-ignore
    return this.withMutations((list) => {
      seqs.forEach((seq) => seq.forEach((value) => list.push(value)));
    });
  }

  /**
   *
   * @param {number} size
   * @returns {ListImpl<T>}
   */
  setSize(size) {
    return setListBounds(this, 0, size);
  }

  /**
   * Maps over the list elements
   * @param {function(T, number, ImmutableList<T>): T} mapper - The mapping function
   * @param {*} [context] - The context to bind to the mapper function
   * @returns {ImmutableList<T>} A new list with mapped values
   */
  map(mapper, context) {
    // @ts-ignore
    return this.withMutations((list) => {
      for (let i = 0; i < this.size; i++) {
        list.set(i, mapper.call(context, list.get(i), i, this));
      }
    });
  }

  // @pragma Iteration

  /**
   *
   * @param {number} [begin]
   * @param {number} [end]
   * @returns {ListImpl<T>}
   */
  // @ts-ignore
  slice(begin, end) {
    const size = this.size;
    if (wholeSlice(begin, end, size)) {
      // @ts-ignore
      return this;
    }
    return setListBounds(
      this,
      resolveBegin(begin, size),
      resolveEnd(end, size)
    );
  }

  /**
   * 
   * @param {import('./Iterator').IterationType} type 
   * @param {boolean} reverse 
   * @returns {Iterator<T>}
   */
  __iterator(type, reverse) {
    let index = reverse ? this.size : 0;
    const values = iterateList(this, reverse);
    return new Iterator(() => {
      const value = values();
      return value === DONE
        ? iteratorDone()
        : iteratorValue(type, reverse ? --index : index++, value);
    });
  }

  /**
   * @param {(value: T | undefined, key: number, collection: ListImpl<T>) => {} | T | undefined} fn
   * @param {boolean} reverse
   * @returns {number}
   */
  __iterate(fn, reverse) {
    let index = reverse ? this.size : 0;
    const values = iterateList(this, reverse);
    let value;
    while ((value = values()) !== DONE) {
      if (fn(value, reverse ? --index : index++, this) === false) {
        break;
      }
    }
    return index;
  }

  /**
   * Ensures the list has the correct owner ID for mutation tracking
   * @param {unknown} ownerID - The owner ID to assign
   * @returns {ListImpl<T>} This list or a new list with the owner ID
   */
  __ensureOwner(ownerID) {
    if (ownerID === this.__ownerID) {
      // @ts-ignore
      return this;
    }
    if (!ownerID) {
      if (this.size === 0) {
        return emptyList();
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      // @ts-ignore
      return this;
    }
    // @ts-ignore
    return new ListImpl(
      this._origin,
      this._capacity,
      this._level,
      this._root,
      this._tail,
      ownerID,
      this.__hash
    );
  }
}

List.isList = isList;

const ListPrototype = ListImpl.prototype;
ListPrototype[IS_LIST_SYMBOL] = true;
ListPrototype[DELETE] = ListPrototype.remove;
ListPrototype['merge'] = ListPrototype.concat;
ListPrototype['setIn'] = setIn;
ListPrototype['deleteIn'] = ListPrototype['removeIn'] = deleteIn;
ListPrototype['update'] = update;
ListPrototype['updateIn'] = updateIn;
ListPrototype['mergeIn'] = mergeIn;
ListPrototype['mergeDeepIn'] = mergeDeepIn;

/**
 * @template T
 * @type {ImmutableList<T>["withMutations"]}
 */
ListPrototype['withMutations'] = withMutations;
ListPrototype['wasAltered'] = wasAltered;
ListPrototype['asImmutable'] = asImmutable;
ListPrototype['@@transducer/init'] = ListPrototype['asMutable'] = asMutable;
ListPrototype['@@transducer/step'] = function (result, arr) {
  return result.push(arr);
};
ListPrototype['@@transducer/result'] = function (obj) {
  return obj.asImmutable();
};

/**
 * @template T
 */
class VNode {
  /**
   *
   * @param {Array<T | undefined> | Array<VNode<T> | undefined>} array
   * @param {unknown} [ownerID]
   */
  constructor(array, ownerID) {
    this.array = array;
    this.ownerID = ownerID;
  }

  // TODO: seems like these methods are very similar

  /**
   *
   * @param {unknown} ownerID
   * @param {number} level
   * @param {number} index
   * @returns {VNode<T>}
   */
  removeBefore(ownerID, level, index) {
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
    let newChild;
    if (level > 0) {
      const oldChild = this.array[originIndex];
      newChild =
        // @ts-ignore
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

  /**
   *
   * @param {unknown} ownerID
   * @param {number} level
   * @param {number} index
   * @returns {VNode<T>}
   */
  removeAfter(ownerID, level, index) {
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

    let newChild;
    if (level > 0) {
      /** @type {VNode<T> | undefined} */
      // @ts-ignore
      const oldChild = this.array[sizeIndex];
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

const DONE = {};

/**
 * @template T
 * @param {ListImpl<T>} list
 * @param {boolean} reverse
 * @returns {T | undefined | DONE}
 */
function iterateList(list, reverse) {
  const left = list._origin;
  const right = list._capacity;
  const tailPos = getTailOffset(right);

  const tail = list._tail;

  return iterateNodeOrLeaf(list._root, list._level, 0);

  /**
   *
   * @param {VNode<T> | undefined | null} node
   * @param {number} level
   * @param {number} offset
   * @returns {() => {} | T | undefined }
   */
  function iterateNodeOrLeaf(node, level, offset) {
    return level === 0
      ? iterateLeaf(node, offset)
      : iterateNode(node, level, offset);
  }

  /**
   *
   * @param {VNode<T> | undefined | null} node
   * @param {number} offset
   * @returns {() => DONE | T | undefined }
   */
  function iterateLeaf(node, offset) {
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
      return array && array[idx];
    };
  }

  /**
   * @template T
   * @param {VNode<T> | undefined | null} node
   * @param {number} level
   * @param {number} offset
   * @returns {() => {} | T | undefined }
   */
  function iterateNode(node, level, offset) {
    let values;
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
          if (value !== DONE) {
            return value;
          }
          values = null;
        }
        if (from === to) {
          return DONE;
        }
        const idx = reverse ? --to : from++;
        values = iterateNodeOrLeaf(
          // @ts-ignore
          array && array[idx],
          level - SHIFT,
          offset + (idx << level)
        );
      }
    };
  }
}


/**
 * @template T
 * @returns {ListImpl<T>}
 */
export function emptyList() {
  // @ts-ignore
  return new ListImpl(0, 0, SHIFT);
}


/**
 * @template T
 * @param {ListImpl<T>} list
 * @param {number} index
 * @param {T | undefined} value
 * @returns {ListImpl<T>}
 */
function updateList(list, index, value) {
  index = wrapIndex(list, index);

  if (index !== index) {
    return list;
  }

  if (index >= list.size || index < 0) {
    // @ts-ignore
    return list.withMutations((list) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- TODO enable eslint here
      index < 0
        ? setListBounds(list, index).set(0, value)
        : setListBounds(list, 0, index + 1).set(index, value);
    });
  }

  index += list._origin;

  let newTail = list._tail;
  let newRoot = list._root;
  const didAlter = MakeRef();
  if (index >= getTailOffset(list._capacity)) {
    // @ts-ignore
    newTail = updateVNode(newTail, list.__ownerID, 0, index, value, didAlter);
  } else {
    // @ts-ignore
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
  return new ListImpl(
    list._origin,
    list._capacity,
    list._level,
    newRoot,
    newTail
  );
}

/**
 * @template T
 * @param {VNode<T> | undefined | null} node
 * @param {unknown} ownerID
 * @param {number} level
 * @param {number} index
 * @param {T | undefined} value
 * @param {{ value: boolean }} didAlter
 * @returns {VNode<unknown> | undefined | null}
 */
function updateVNode(node, ownerID, level, index, value, didAlter) {
  const idx = (index >>> level) & MASK;
  const nodeHas = node && idx < node.array.length;
  if (!nodeHas && value === undefined) {
    return node;
  }

  let newNode;

  if (level > 0) {
    /** @type { VNode<T> | undefined} */
    // @ts-ignore
    const lowerNode = node && node.array[idx];
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
     // @ts-ignore
    newNode.array[idx] = newLowerNode;
    return newNode;
  }

  if (nodeHas && node.array[idx] === value) {
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

/**
 * @template {VNode<?> | undefined | null} NODE extends VNode<unknown> | undefined | null
 * @param {NODE} node
 * @param {unknown} ownerID
 * @returns {NonNullable<NODE>}
 */
function editableVNode(node, ownerID) {
  if (ownerID && node && ownerID === node.ownerID) {
    return node;
  }
  // @ts-ignore
  return new VNode(node ? node.array.slice() : [], ownerID);
}

/**
 * @template T
 * @param {ListImpl<T>} list
 * @param {number} rawIndex
 * @returns {VNode<T> | undefined | null}
 */
function listNodeFor(list, rawIndex) {
  if (rawIndex >= getTailOffset(list._capacity)) {
    return list._tail;
  }
  if (rawIndex < 1 << (list._level + SHIFT)) {
    let node = list._root;
    let level = list._level;
    while (node && level > 0) {
      // @ts-ignore
      node = node.array[(rawIndex >>> level) & MASK];
      level -= SHIFT;
    }
    return node;
  }
}

/**
 * @template T
 * @param {ListImpl<T>} list
 * @param {number} begin
 * @param {number} [end]
 * @returns {ListImpl<T>}
 */
function setListBounds(list, begin, end) {
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
  let newOrigin = oldOrigin + begin;
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
  /** @type {VNode<T> | undefined | null} */
  let newRoot = list._root;

  // New origin might need creating a higher root.
  let offsetShift = 0;
  while (newOrigin + offsetShift < 0) {
    // @ts-ignore
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
    // @ts-ignore
    newRoot = new VNode(
      newRoot && newRoot.array.length ? [newRoot] : [],
      owner
    );
    newLevel += SHIFT;
  }

  // Locate or create the new tail.
  const oldTail = list._tail;
  /** @type {VNode<T> | undefined | null} */
  // @ts-ignore
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
    // @ts-ignore
    newRoot = editableVNode(newRoot, owner);
    let node = newRoot;
    for (let level = newLevel; level > SHIFT; level -= SHIFT) {
      const idx = (oldTailOffset >>> level) & MASK;
      // @ts-ignore
      node = node.array[idx] = editableVNode(node.array[idx], owner);
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
      // @ts-ignore TODO check this
      if ((beginIndex !== newTailOffset >>> newLevel) & MASK) {
        break;
      }
      if (beginIndex) {
        offsetShift += (1 << newLevel) * beginIndex;
      }
      newLevel -= SHIFT;
      // @ts-ignore
      newRoot = newRoot.array[beginIndex];
    }

    // Trim the new sides of the new root.
    if (newRoot && newOrigin > oldOrigin) {
      // @ts-ignore
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
  return new ListImpl(newOrigin, newCapacity, newLevel, newRoot, newTail);
}

/**
 *
 * @param {number} size
 * @returns {number}
 */
function getTailOffset(size) {
  return size < SIZE ? 0 : ((size - 1) >>> SHIFT) << SHIFT;
}
