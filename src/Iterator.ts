import type {
  ImmutableIterator,
  IterateType,
  IteratorDoneResult,
  ImmIteratorResult,
  IteratorValueResult,
} from './internalTypes';
import { writable } from './utils/reinterpret';

export const ITERATE_KEYS = 0;
export const ITERATE_VALUES = 1;
export const ITERATE_ENTRIES = 2;

const REAL_ITERATOR_SYMBOL = typeof Symbol === 'function' && Symbol.iterator;
const FAUX_ITERATOR_SYMBOL = '@@iterator';

export const ITERATOR_SYMBOL: typeof Symbol.iterator | '@@iterator' =
  REAL_ITERATOR_SYMBOL || FAUX_ITERATOR_SYMBOL;

type NextFn<T> = () => ImmIteratorResult<T>;

// `implements` keeps the class and the structural interface from drifting
// apart — they were previously synced by hand.
export class Iterator<T = unknown> implements ImmutableIterator<T> {
  // Own property for direct `new Iterator(fn)` uses; a subclass (MapIterator)
  // instead defines `next` on its prototype and constructs with no argument,
  // matching the 5.0.x object shape — hence `declare` + conditional assign.
  declare next: NextFn<T>;

  // Assigned on the prototype below; declared here so the type is known.
  declare inspect: () => string;
  declare toSource: () => string;

  static KEYS: 0 = ITERATE_KEYS;
  static VALUES: 1 = ITERATE_VALUES;
  static ENTRIES: 2 = ITERATE_ENTRIES;

  constructor(next?: NextFn<T>) {
    if (next) {
      this.next = next;
    }
  }

  toString(): string {
    return '[Iterator]';
  }
}

Iterator.prototype.inspect = Iterator.prototype.toSource = function (
  this: Iterator
): string {
  return this.toString();
};
writable(Iterator.prototype)[ITERATOR_SYMBOL] = function (
  this: Iterator
): Iterator {
  return this;
};

// Prevents a type parameter from being inferred at a use site (polyfill of
// the TS 5.4 `NoInfer` intrinsic for the 5.1 toolchain).
type NoInfer<T> = [T][T extends T ? 0 : never];

// `S` is the step type the (deliberately reused, non-done) result cell
// carried BEFORE this call; the cell is re-tagged in place with the new step
// `T`.
export function iteratorValue<T, S = T>(
  type: IterateType,
  k: unknown,
  v: unknown,
  iteratorResult?: IteratorValueResult<S | NoInfer<T>>
): IteratorValueResult<T> {
  const value = (type === 0 ? k : type === 1 ? v : [k, v]) as T;
  if (iteratorResult) {
    iteratorResult.value = value;
  } else {
    iteratorResult = {
      value: value,
      done: false,
    };
  }
  // After the write above the reused cell carries the new step tag.
  return iteratorResult as IteratorValueResult<T>;
}

export function iteratorDone(): IteratorDoneResult {
  return { value: undefined, done: true };
}

export function hasIterator(maybeIterable: unknown): boolean {
  if (Array.isArray(maybeIterable)) {
    // IE11 trick as it does not support `Symbol.iterator`
    return true;
  }

  return !!getIteratorFn(maybeIterable);
}

export function isIterator(
  maybeIterator: unknown
): maybeIterator is { next: () => ImmIteratorResult<unknown> } {
  return (
    !!maybeIterator &&
    typeof (maybeIterator as { next?: unknown }).next === 'function'
  );
}

type IteratorFn = () => Iterator;

export function getIterator(iterable: unknown): Iterator | undefined {
  const iteratorFn = getIteratorFn(iterable);
  return iteratorFn ? iteratorFn.call(iterable) : undefined;
}

function getIteratorFn(iterable: unknown): IteratorFn | undefined {
  if (!iterable) {
    return undefined;
  }
  const source = iterable as Record<PropertyKey, unknown>;
  const iteratorFn =
    (REAL_ITERATOR_SYMBOL && source[REAL_ITERATOR_SYMBOL]) ||
    source[FAUX_ITERATOR_SYMBOL];
  if (typeof iteratorFn === 'function') {
    return iteratorFn as IteratorFn;
  }
  return undefined;
}

export function isEntriesIterable(maybeIterable: unknown): boolean {
  const iteratorFn = getIteratorFn(maybeIterable);
  return (
    !!iteratorFn &&
    iteratorFn === (maybeIterable as { entries?: unknown }).entries
  );
}

export function isKeysIterable(maybeIterable: unknown): boolean {
  const iteratorFn = getIteratorFn(maybeIterable);
  return (
    !!iteratorFn && iteratorFn === (maybeIterable as { keys?: unknown }).keys
  );
}
