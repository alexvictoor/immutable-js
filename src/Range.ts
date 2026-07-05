import {
  CONSTRUCT,
  wrapIndex,
  wholeSlice,
  resolveBegin,
  resolveEnd,
} from './TrieUtils';
import { IndexedSeq } from './Seq';
import { Iterator, iteratorValue, iteratorDone } from './Iterator';

import invariant from './utils/invariant';
import deepEqual from './utils/deepEqual';
import type {
  IterateType,
  ImmutableIterator,
  IteratorStep,
  SideEffect,
} from './internalTypes';

/**
 * Returns a lazy seq of nums from start (inclusive) to end
 * (exclusive), by step, where start defaults to 0, step to 1, and end to
 * infinity. When start is equal to end, returns empty list.
 */
export class Range extends IndexedSeq<number> {
  // Always known: the constructor computes it from start/end/step.
  declare size: number;
  _start!: number;
  _end!: number;
  _step!: number;

  constructor(start: number, end: number, step = 1) {
    super(CONSTRUCT);
    if (!(this instanceof Range)) {
      // eslint-disable-next-line no-constructor-return
      return new Range(start, end, step);
    }
    invariant(step !== 0, 'Cannot step a Range by 0');
    invariant(
      start !== undefined,
      'You must define a start value when using Range'
    );
    invariant(
      end !== undefined,
      'You must define an end value when using Range'
    );

    step = Math.abs(step);
    if (end < start) {
      step = -step;
    }
    this._start = start;
    this._end = end;
    this._step = step;
    this.size = Math.max(0, Math.ceil((end - start) / step - 1) + 1);
    if (this.size === 0) {
      if (EMPTY_RANGE) {
        // eslint-disable-next-line no-constructor-return
        return EMPTY_RANGE;
      }
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      EMPTY_RANGE = this;
    }
  }

  toString(): string {
    if (this.size === 0) {
      return 'Range []';
    }
    return (
      'Range [ ' +
      this._start +
      '...' +
      this._end +
      (this._step !== 1 ? ' by ' + this._step : '') +
      ' ]'
    );
  }

  get(index: number): number | undefined;
  get<NSV>(index: number, notSetValue: NSV): number | NSV;
  get<NSV>(index: number, notSetValue?: NSV): number | NSV | undefined {
    return this.has(index)
      ? this._start + wrapIndex(this, index) * this._step
      : notSetValue;
  }

  includes(searchValue: number): boolean {
    const possibleIndex = (searchValue - this._start) / this._step;
    return (
      possibleIndex >= 0 &&
      possibleIndex < this.size &&
      possibleIndex === Math.floor(possibleIndex)
    );
  }

  slice(begin?: number, end?: number): this {
    if (wholeSlice(begin, end, this.size)) {
      return this;
    }
    const resolvedBegin = resolveBegin(begin, this.size);
    const resolvedEnd = resolveEnd(end, this.size);
    if (resolvedEnd === undefined || resolvedEnd <= resolvedBegin) {
      return new Range(0, 0) as this;
    }
    return new Range(
      this.get(resolvedBegin, this._end),
      this.get(resolvedEnd, this._end),
      this._step
    ) as this;
  }

  indexOf(searchValue: number): number {
    const offsetValue = searchValue - this._start;
    if (offsetValue % this._step === 0) {
      const index = offsetValue / this._step;
      if (index >= 0 && index < this.size) {
        return index;
      }
    }
    return -1;
  }

  lastIndexOf(searchValue: number): number {
    return this.indexOf(searchValue);
  }

  __iterate(
    fn: SideEffect<number, number, unknown>,
    reverse?: boolean
  ): number {
    const size = this.size;
    const step = this._step;
    let value = reverse ? this._start + (size - 1) * step : this._start;
    let i = 0;
    while (i !== size) {
      if (fn(value, reverse ? size - ++i : i++, this) === false) {
        break;
      }
      value += reverse ? -step : step;
    }
    return i;
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<number, number>> {
    const size = this.size;
    const step = this._step;
    let value = reverse ? this._start + (size - 1) * step : this._start;
    let i = 0;
    return new Iterator(() => {
      if (i === size) {
        return iteratorDone();
      }
      const v = value;
      value += reverse ? -step : step;
      return iteratorValue(type, reverse ? size - ++i : i++, v);
    });
  }

  equals(other: unknown): boolean {
    return other instanceof Range
      ? this._start === other._start &&
          this._end === other._end &&
          this._step === other._step
      : deepEqual(this, other);
  }
}

let EMPTY_RANGE: Range | undefined;
