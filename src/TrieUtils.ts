import type { IterableLike, Ref } from './internalTypes';

// Used for setting prototype methods that IE8 chokes on.
export const DELETE = 'delete';

// Constants describing the size of trie nodes.
export const SHIFT = 5; // Resulted in best performance after ______?
export const SIZE = 1 << SHIFT;
export const MASK = SIZE - 1;

// A consistent shared value representing "not set" which equals nothing other
// than itself, and nothing that could be provided externally. It carries a
// nominal brand (compile-time only; the runtime value is a bare object) so the
// `isNotSet` guard below can narrow a `T | NotSet` union — to `NotSet` in the
// true branch and `T` in the else branch — removing follow-up casts. (A bare
// `x === NOT_SET` comparison does NOT narrow: `NotSet` is an object type, not
// a unit type, so prefer the guard wherever narrowing matters.)
declare const NOT_SET_BRAND: unique symbol;
export type NotSet = { readonly [NOT_SET_BRAND]: true };
export const NOT_SET = {} as NotSet;

// Type guard: narrows a `T | NotSet` union to `NotSet` (true branch) / `T`
// (else branch), so callers avoid an `as T` cast after a NOT_SET check.
export function isNotSet(value: unknown): value is NotSet {
  return value === NOT_SET;
}

// Private token passed by a subclass constructor's `super(...)` call so that a
// base collection constructor skips its coercion/return-override "factory"
// behavior and simply constructs the instance. It can never be a value a caller
// would pass to a public factory (the object reference never escapes this
// module graph), so `new List()` etc. still coerce correctly.
//
// NOTE: deliberately NOT a Symbol — the library supports Symbol-less ES5
// engines (README: "even IE11"), so a top-level `Symbol()` call would crash at
// load time. Like NOT_SET above, a nominal brand keeps the type distinct while
// the runtime value is a bare object.
declare const CONSTRUCT_BRAND: unique symbol;
export type ConstructToken = { readonly [CONSTRUCT_BRAND]: true };
export const CONSTRUCT = {} as ConstructToken;

// Boolean references, Rough equivalent of `bool &`.
export function MakeRef(): Ref {
  return { value: false };
}

export function SetRef(ref: Ref | undefined): void {
  if (ref) {
    ref.value = true;
  }
}

// A value representing an "owner" for transient writes to tries. Each instance
// only ever equals itself, and will not equal the return of any subsequent
// `new OwnerID()`.
export class OwnerID {}

export function ensureSize(iter: IterableLike<unknown, unknown>): number {
  if (iter.size === undefined) {
    return (iter.size = iter.__iterate(returnTrue));
  }
  return iter.size;
}

export function wrapIndex(
  iter: IterableLike<unknown, unknown>,
  index: number | string
): number {
  // This implements "is array index" which the ECMAString spec defines as:
  //
  //     A String property name P is an array index if and only if
  //     ToString(ToUint32(P)) is equal to P and ToUint32(P) is not equal
  //     to 2^32−1.
  //
  // http://www.ecma-international.org/ecma-262/6.0/#sec-array-exotic-objects
  if (typeof index !== 'number') {
    const uint32Index = Number(index) >>> 0; // ToUint32
    if ('' + uint32Index !== index || uint32Index === 4294967295) {
      return NaN;
    }
    index = uint32Index;
  }
  return index < 0 ? ensureSize(iter) + index : index;
}

export function returnTrue(): boolean {
  return true;
}

export function wholeSlice(
  begin: number | undefined,
  end: number | undefined,
  size: number | undefined
): boolean {
  return (
    ((begin === 0 && !isNeg(begin)) ||
      (size !== undefined && begin !== undefined && begin <= -size)) &&
    (end === undefined || (size !== undefined && end >= size))
  );
}

export function resolveBegin(
  begin: number | undefined,
  size: number | undefined
): number {
  return resolveIndex(begin, size, 0);
}

export function resolveEnd(
  end: number | undefined,
  size: number | undefined
): number | undefined {
  return resolveIndex(end, size, size);
}

function resolveIndex(
  index: number | undefined,
  size: number | undefined,
  defaultIndex: number
): number;
function resolveIndex(
  index: number | undefined,
  size: number | undefined,
  defaultIndex: number | undefined
): number | undefined;
function resolveIndex(
  index: number | undefined,
  size: number | undefined,
  defaultIndex: number | undefined
): number | undefined {
  // Sanitize indices using this shorthand for ToInt32(argument)
  // http://www.ecma-international.org/ecma-262/6.0/#sec-toint32
  return index === undefined
    ? defaultIndex
    : isNeg(index)
    ? size === Infinity
      ? size
      : // `size + index` when size is unknown mirrors the original loose
        // arithmetic: undefined + n === NaN, and Math.max(0, NaN) | 0 === 0.
        Math.max(0, (size === undefined ? NaN : size) + index) | 0
    : size === undefined || size === index
    ? index
    : Math.min(size, index) | 0;
}

function isNeg(value: number): boolean {
  // Account for -0 which is negative, but not less than 0.
  return value < 0 || (value === 0 && 1 / value === -Infinity);
}
