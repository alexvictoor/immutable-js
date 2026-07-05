import { CONSTRUCT, wholeSlice, resolveBegin, resolveEnd } from './TrieUtils';
import { IndexedSeq } from './Seq';
import { is } from './is';
import { Iterator, iteratorValue, iteratorDone } from './Iterator';

import deepEqual from './utils/deepEqual';
import type {
  IterateType,
  ImmutableIterator,
  IteratorStep,
  SideEffect,
} from './internalTypes';

/**
 * Returns a lazy Seq of `value` repeated `times` times. When `times` is
 * undefined, returns an infinite sequence of `value`.
 */
export class Repeat<T> extends IndexedSeq<T> {
  // Always known: `times` (or `Infinity`) is assigned in the constructor.
  declare size: number;
  _value!: T;

  constructor(value: T, times?: number) {
    super(CONSTRUCT);
    if (!(this instanceof Repeat)) {
      // eslint-disable-next-line no-constructor-return
      return new Repeat(value, times);
    }
    this._value = value;
    this.size = times === undefined ? Infinity : Math.max(0, times);
    if (this.size === 0) {
      if (EMPTY_REPEAT) {
        // eslint-disable-next-line no-constructor-return
        return EMPTY_REPEAT as Repeat<T>;
      }
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      EMPTY_REPEAT = this;
    }
  }

  toString(): string {
    if (this.size === 0) {
      return 'Repeat []';
    }
    return 'Repeat [ ' + this._value + ' ' + this.size + ' times ]';
  }

  get(index: number): T | undefined;
  get<NSV>(index: number, notSetValue: NSV): T | NSV;
  get<NSV>(index: number, notSetValue?: NSV): T | NSV | undefined {
    return this.has(index) ? this._value : notSetValue;
  }

  includes(searchValue: T): boolean {
    return is(this._value, searchValue);
  }

  slice(begin?: number, end?: number): this {
    const size = this.size;
    return wholeSlice(begin, end, size)
      ? this
      : (new Repeat(
          this._value,
          (resolveEnd(end, size) ?? NaN) - resolveBegin(begin, size)
        ) as this);
  }

  reverse(): this {
    return this;
  }

  indexOf(searchValue: T): number {
    if (is(this._value, searchValue)) {
      return 0;
    }
    return -1;
  }

  lastIndexOf(searchValue: T): number {
    if (is(this._value, searchValue)) {
      return this.size;
    }
    return -1;
  }

  __iterate(fn: SideEffect<number, T, unknown>, reverse?: boolean): number {
    const size = this.size;
    let i = 0;
    while (i !== size) {
      if (fn(this._value, reverse ? size - ++i : i++, this) === false) {
        break;
      }
    }
    return i;
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<number, T>> {
    const size = this.size;
    let i = 0;
    return new Iterator(() =>
      i === size
        ? iteratorDone()
        : iteratorValue(type, reverse ? size - ++i : i++, this._value)
    );
  }

  equals(other: unknown): boolean {
    return other instanceof Repeat
      ? is(this._value, other._value)
      : deepEqual(this, other);
  }
}

let EMPTY_REPEAT: Repeat<unknown> | undefined;
