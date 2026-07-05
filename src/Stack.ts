import {
  CONSTRUCT,
  wholeSlice,
  resolveBegin,
  resolveEnd,
  wrapIndex,
  OwnerID,
} from './TrieUtils';
import { IndexedCollection } from './Collection';
import { ArraySeq } from './Seq';
import { Iterator, iteratorValue, iteratorDone } from './Iterator';
import { IS_STACK_SYMBOL, isStack } from './predicates/isStack';
import assertNotInfinite from './utils/assertNotInfinite';
import { asImmutable } from './methods/asImmutable';
import { asMutable } from './methods/asMutable';
import { wasAltered } from './methods/wasAltered';
import { withMutations } from './methods/withMutations';
import { viewCollectionAs, writable } from './utils/reinterpret';
import type {
  IterateType,
  ImmutableIterator,
  IteratorStep,
  SideEffect,
} from './internalTypes';

interface StackNode<T> {
  value: T;
  next: StackNode<T> | undefined;
}

// Merged interface for prototype-attached members (aliases and mixin
// methods), in METHOD syntax — matching the other collections' declaration
// style (see the NOTE in internalTypes.ts on why method syntax matters).
export interface Stack<T> extends IndexedCollection<T> {
  [IS_STACK_SYMBOL]: true;
  shift(): Stack<T>;
  unshift(...values: Array<T>): Stack<T>;
  unshiftAll(iter: Iterable<T>): Stack<T>;
  withMutations(mutator: (mutable: this) => unknown): this;
  wasAltered(): boolean;
  asImmutable(): this;
  asMutable(): this;
}
export class Stack<T> extends IndexedCollection<T> {
  // A Stack always knows its size (narrows the base's `number | undefined`).
  declare size: number;
  _head: StackNode<T> | undefined;

  declare static isStack: typeof isStack;

  // @pragma Construction

  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    const coerced: unknown =
      value === undefined || value === null
        ? emptyStack()
        : isStack(value)
        ? value
        : emptyStack().pushAll(value as Iterable<T>);
    // eslint-disable-next-line no-constructor-return
    return coerced as Stack<T>;
  }

  static of<T>(...values: Array<T>): Stack<T>;
  static of(): Stack<unknown> {
    // eslint-disable-next-line prefer-rest-params
    return new this(arguments);
  }

  toString(): string {
    return this.__toString('Stack [', ']');
  }

  // @pragma Access

  get(index: number): T | undefined;
  get<NSV>(index: number, notSetValue: NSV): T | NSV;
  get<NSV>(index: number, notSetValue?: NSV): T | NSV | undefined {
    let head = this._head;
    index = wrapIndex(this, index);
    while (head && index--) {
      head = head.next;
    }
    return head ? head.value : notSetValue;
  }

  peek(): T | undefined {
    return this._head && this._head.value;
  }

  // @pragma Modification

  push(...values: Array<T>): Stack<T>;
  push(): Stack<T> {
    // Implemented via `arguments` (not a rest param) to avoid a per-call array
    // allocation in the ES5 output — this is a hot path.
    // eslint-disable-next-line prefer-rest-params
    const values = arguments as ArrayLike<T>;
    if (values.length === 0) {
      return this;
    }
    const newSize = this.size + values.length;
    let head = this._head;
    for (let ii = values.length - 1; ii >= 0; ii--) {
      head = {
        value: values[ii]!,
        next: head,
      };
    }
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  }

  pushAll(iter: Iterable<T>): Stack<T> {
    const collection = new IndexedCollection<T>(iter);
    if (collection.size === 0) {
      return this;
    }
    const collectionIsStack = isStack(collection);
    if (this.size === 0 && collectionIsStack) {
      // The guard proved it IS a stack; re-key its erased element type to T.
      return viewCollectionAs<Stack<T>>(collection);
    }
    assertNotInfinite(collection.size);
    let newSize = this.size;
    let head = this._head;
    collection.__iterate(value => {
      newSize++;
      head = {
        value,
        next: head,
      };
    }, /* reverse */ true);
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  }

  pop(): Stack<T> {
    return this.slice(1);
  }

  clear(): Stack<T> {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._head = undefined;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyStack();
  }

  slice(begin?: number, end?: number): this {
    if (wholeSlice(begin, end, this.size)) {
      return this;
    }
    let resolvedBegin = resolveBegin(begin, this.size);
    const resolvedEnd = resolveEnd(end, this.size);
    if (resolvedEnd !== this.size) {
      // super.slice(begin, end); `callableAs` cannot claim this signature —
      // its params are narrower than the Top-wide ones the helper requires
      // (see the exceptions note in utils/reinterpret.ts).
      return (
        IndexedCollection.prototype.slice as (
          this: unknown,
          begin?: number,
          end?: number
        ) => this
      ).call(this, begin, end);
    }
    const newSize = this.size - resolvedBegin;
    let head = this._head;
    while (resolvedBegin--) {
      head = head!.next;
    }
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head) as this;
  }

  // @pragma Mutability

  __ensureOwner(ownerID: OwnerID | undefined): this {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      if (this.size === 0) {
        return emptyStack() as this;
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeStack(this.size, this._head, ownerID, this.__hash) as this;
  }

  // @pragma Iteration

  __iterate(fn: SideEffect<number, T, unknown>, reverse?: boolean): number {
    if (reverse) {
      return new ArraySeq(this.toArray()).__iterate(
        (v, k) => fn(v, k, this),
        reverse
      );
    }
    let iterations = 0;
    let node = this._head;
    while (node) {
      if (fn(node.value, iterations++, this) === false) {
        break;
      }
      node = node.next;
    }
    return iterations;
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<number, T>> {
    if (reverse) {
      return new ArraySeq(this.toArray()).__iterator(type, reverse);
    }
    let iterations = 0;
    let node = this._head;
    return new Iterator(() => {
      if (node) {
        const value = node.value;
        node = node.next;
        return iteratorValue(type, iterations++, value);
      }
      return iteratorDone();
    });
  }
}

Stack.isStack = isStack;

const StackPrototype = Stack.prototype;
const writableProto = writable(StackPrototype);
StackPrototype[IS_STACK_SYMBOL] = true;
StackPrototype.shift = StackPrototype.pop;
StackPrototype.unshift = StackPrototype.push;
StackPrototype.unshiftAll = StackPrototype.pushAll;
StackPrototype.withMutations = withMutations;
StackPrototype.wasAltered = wasAltered;
StackPrototype.asImmutable = asImmutable;
writableProto['@@transducer/init'] = StackPrototype.asMutable = asMutable;
writableProto['@@transducer/step'] = function (
  result: Stack<unknown>,
  arr: unknown
) {
  return result.unshift(arr);
};
writableProto['@@transducer/result'] = function (obj: Stack<unknown>) {
  return obj.asImmutable();
};

function makeStack<T>(
  size: number,
  head?: StackNode<T> | undefined,
  ownerID?: OwnerID,
  hash?: number | undefined
): Stack<T> {
  const map: Stack<T> = Object.create(StackPrototype);
  map.size = size;
  map._head = head;
  map.__ownerID = ownerID;
  map.__hash = hash;
  map.__altered = false;
  return map;
}

// A single shared empty Stack, reused for every element type. An empty
// collection is a valid `Stack<T>` for any `T` (it holds no `T`s), and the
// generic is erased at runtime; the widening reflects that invariant-position
// safety the checker can't infer on its own.
let EMPTY_STACK: Stack<unknown> | undefined;
function emptyStack<T>(): Stack<T> {
  const empty = EMPTY_STACK || (EMPTY_STACK = makeStack<unknown>(0));
  // `Stack` is invariant in its element type, so the checker cannot see that
  // the (element-less) shared empty stack inhabits every `Stack<T>`. It does;
  // the generic is erased at runtime.
  return empty as Stack<T>;
}
