/**
 * Internal, implementation-facing types shared across the library source.
 *
 * These describe the *runtime* shape of the collection machinery (the `__`
 * methods, trie nodes, owner ids, …) that the public `type-definitions`
 * deliberately hide. They are intentionally structural and use generics +
 * `unknown` — never `any` — so the strict compiler keeps every call site
 * honest.
 *
 * This module is type-only (no runtime imports) to stay free of the many
 * dependency cycles in the collection graph.
 */

import type { OwnerID } from './TrieUtils';

/** Discriminates what `__iterate` / `__iterator` should yield. */
export type IterateType = 0 | 1 | 2; // KEYS | VALUES | ENTRIES

/**
 * A user callback's `thisArg`. JavaScript permits ANY value here (primitives
 * included, via `Function.prototype.call`), so the top type is the honest
 * one; the alias names that intent once instead of scattering `unknown`.
 */
export type ThisArg = unknown;

/**
 * The result a predicate/side-effect returns into `__iterate`: only a strict
 * `=== false` aborts iteration, every other value continues, so callers may
 * return anything.
 */
export type IterationResult = unknown;

/** A mutable boolean reference, the rough equivalent of `bool&` in C. */
export interface Ref {
  value: boolean;
}

/** A value that describes its own equality and hash (see `is`). */
export interface ValueObject {
  equals(other: unknown): boolean;
  hashCode(): number;
}

/**
 * Immutable's lightweight Iterator result, discriminated on `done`: a done
 * result's cell always carries `undefined`, which makes exhausted cells
 * assignable to ANY step type — pass-through code needs no reinterpretation.
 *
 * Named `ImmIteratorResult` (not `IteratorResult`) so it can never silently
 * shadow — or be shadowed by — the structurally-similar lib global, whose
 * `done?: boolean` would defeat the strict discrimination this type exists
 * to provide.
 */
export interface IteratorValueResult<T> {
  value: T;
  done: false;
}
export interface IteratorDoneResult {
  value: undefined;
  done: true;
}
export type ImmIteratorResult<T> = IteratorValueResult<T> | IteratorDoneResult;

export interface ImmutableIterator<T> {
  next(): ImmIteratorResult<T>;
  toString(): string;
  [Symbol.iterator]?(): ImmutableIterator<T>;
}

/**
 * A step yielded by `__iterator`: the key, the value, or the [key, value]
 * entry, depending on the IterateType requested at runtime — plus `undefined`
 * for a done result's cell.
 */
export type IteratorStep<K, V> = K | V | [K, V] | undefined;

/**
 * The side-effecting step function passed to `__iterate`. Returning `false`
 * (strictly) aborts iteration; any other return continues.
 */
export type SideEffect<K, V, C> = (
  value: V,
  key: K,
  iter: C
) => IterationResult;

/**
 * The core iteration pair every collection view carries.
 *
 * NOTE: members use METHOD syntax deliberately. Under `strictFunctionTypes`
 * only function-PROPERTY syntax is checked contravariantly; method syntax
 * stays bivariant, which lets concrete collections (whose callbacks take
 * precise generic params) be compared to looser views (`OpSeq`) with a single
 * `as` (see `utils/reinterpret`). Do NOT rewrite these as function properties
 * or re-derive them via indexed access (`X['__iterate']`) — both flip them to
 * strict contravariant checking.
 *
 * `Fn` is the callback the traversal accepts: `SideEffect<K, V, unknown>` on
 * the concrete-collection surface, `SideEffect<K, V, object>` (= `Predicate`)
 * on the lazy `OpSeq` surface.
 */
export interface IterationMethods<K, V, Fn = SideEffect<K, V, unknown>> {
  __iterate(fn: Fn, reverse?: boolean): number;
  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, V>>;
}

/**
 * The "uncached" iteration hooks lazy seqs provide: `Seq`'s base
 * `__iterate`/`__iterator` serve the materialized `_cache` and delegate here
 * otherwise. Optional: root/leaf seqs (ArraySeq, ObjectSeq) override
 * `__iterate` directly and do not provide these; derived/lazy seqs do.
 */
export interface UncachedIterationMethods<
  K,
  V,
  Fn = SideEffect<K, V, unknown>
> {
  __iterateUncached?(fn: Fn, reverse?: boolean): number;
  __iteratorUncached?(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<K, V>>;
}

/**
 * The minimal structural surface of a collection relied on by low-level
 * helpers (`ensureSize`, `wrapIndex`, `deepEqual`, …). Concrete collections
 * implement far more; this is only what the shared utilities require.
 */
export interface IterableLike<K, V> extends IterationMethods<K, V> {
  // Present on every collection. `number | undefined` (lazy Seqs may not know
  // their size until materialized), and writable: `ensureSize` assigns a
  // lazily-computed size back onto the value.
  size: number | undefined;
  __hash?: number | undefined;
}

/**
 * The internal (`__`-prefixed) machinery every concrete collection carries but
 * that the public type-definitions hide. Concrete classes declaration-merge
 * their public interface with this to expose the transient-write plumbing.
 *
 * Where a public interface also declares `size` (the seq family), the two
 * agree — both `number | undefined`.
 */
export interface InternalCollectionMethods<K, V> extends IterableLike<K, V> {
  __ownerID?: OwnerID | undefined;
  __altered?: boolean;
  __ensureOwner(ownerID: OwnerID | undefined): this;
  __toString(head: string, tail: string): string;
}

/**
 * Additional internal surface carried by lazy `Seq`s: the materialization
 * cache and the "uncached" iteration hooks concrete/derived seqs implement.
 */
export interface SeqInternalMethods<K, V>
  extends InternalCollectionMethods<K, V>,
    UncachedIterationMethods<K, V> {
  _cache?: Array<[K, V]> | undefined;
}
