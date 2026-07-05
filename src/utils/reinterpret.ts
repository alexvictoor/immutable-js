/**
 * The single audited home for reinterpreting a value as a different view of
 * itself. Immutable's runtime architecture (prototype mixins, coercion
 * factories, internal `__`-methods hidden from the public types) creates a few
 * seams where a value's static type and its runtime shape are known to diverge.
 *
 * Rather than scattering `as unknown as` double-casts across the codebase,
 * those seams route through these helpers, ordered from most to least
 * constrained. Call sites use the FIRST one whose constraints hold:
 *
 * - `reparam` — the checker proves the target adds no members;
 * - `viewCollectionAs` — the checker proves the source is a real collection;
 * - `callableAs` — the checker proves both sides are object-producing
 *   callables;
 * - `viewAs` — the fully general seam, only where nothing is provable.
 *
 * Every call site is a *single* `as`-free expression, making each kind of
 * reinterpretation in the library greppable by helper name; the real casts
 * live here, once, with this documentation.
 *
 * Known exceptions that CANNOT route through these helpers (each is
 * commented in place):
 * - primitives: `viewAs`/`viewCollectionAs` require an object source, so the
 *   `Set.union` string quirk keeps its one `as unknown as` (src/Set.ts);
 * - `this.constructor` re-claims (src/List.ts, src/Set.ts): typed `Function`
 *   by the lib, which `callableAs`'s parameter-tying constraint cannot admit;
 * - claimed signatures with parameters NARROWER than the Top-wide params
 *   `callableAs` requires (the `slice` super-call in src/Stack.ts, the
 *   `intersect`/`union` prototype re-claims in src/Set.ts);
 * - property probes on `unknown` user input (`(x as { size?: number }).size`):
 *   the value may be a primitive, and only existence is claimed, never a call.
 */

/**
 * The top type, spelled as its equivalent union (`unknown` is exactly
 * `{} | null | undefined`) so that every "any value fits here" position in
 * this module is a deliberate, named decision. Members of a re-parameterized
 * view can hold bare, unbound type parameters, whose only ceiling IS the top
 * type — nothing narrower admits them.
 */
// `{}` is deliberate and load-bearing here (see above) — the lint suggestion
// to replace it would reintroduce the `unknown` keyword this module avoids.
// eslint-disable-next-line @typescript-eslint/ban-types
type Top = {} | null | undefined;

/**
 * Re-parameterize a view: same runtime object, same member set, different
 * generic arguments (`List<T>` → `List<T | M>`, `OpSeq<K, V>` →
 * `OpSeq<number, V>`, a decorated sort tuple → its `{ length }` facet, ...).
 *
 * The mapped-type constraint makes the checker verify the target view
 * introduces NO member the source lacks — this helper can re-type structure
 * but can never invent it.
 */
export function reparam<T extends object>(
  value: {
    [K in keyof T]: Top;
  }
): T {
  return value as T;
}

/**
 * The structural fingerprint of a real collection: the internal iteration
 * machinery every concrete collection, Seq and OpSeq carries. The methods are
 * required to EXIST but are never invoked through this view, so nothing about
 * their signatures is claimed — no dependence on the source's key/value
 * parameters.
 */
interface CollectionMachinery {
  size: number | undefined;
  __iterate: CallableFunction;
  __iterator: CallableFunction;
}

/**
 * View a value already carrying the internal iteration machinery
 * (`size` / `__iterate` / `__iterator`) as another collection view of itself.
 *
 * This is the seam between concrete collections and the internal/public
 * surfaces they exchange (class → `OpSeq`, `OpSeq` → refined public `Seq`
 * types, ...): the target's extra members exist at runtime via the prototype
 * mixins and cannot be proven, but the input constraint guarantees the source
 * is a real collection — an arbitrary object can never pass through.
 */
export function viewCollectionAs<T extends object>(
  collection: CollectionMachinery
): T {
  return collection as T;
}

/**
 * View a function-like value as a callable of type `F`. The source must be a
 * plain function or a class constructor (Immutable's collection classes are
 * callable without `new` — the "return override" coercion pattern — which the
 * type system cannot express), and its parameters are tied to the TARGET's:
 * the source must accept the `Parameters<F>` the claimed signature declares.
 * Both sides are constrained to PRODUCE AN OBJECT (every reinterpreted
 * callable here is a collection factory or a collection-returning method), so
 * a non-function can never be reinterpreted as callable, a callable can never
 * be claimed to return a primitive, and a signature the source cannot satisfy
 * argument-wise can never be claimed.
 */
export function callableAs<F extends (...args: ReadonlyArray<Top>) => object>(
  fn:
    | ((...args: Parameters<F>) => object)
    | (new (...args: Parameters<F>) => object)
): F {
  return fn as F;
}

/**
 * Reinterpret a runtime object as another (object) view of itself — the fully
 * general seam, for views whose static types share nothing the checker can
 * verify (a public collection type re-viewed as the internal one whose
 * members the public type hides, host-object probes, ...). Correctness is the
 * caller's responsibility and is established by construction. Prefer the
 * constrained helpers above wherever their checks hold.
 */
export function viewAs<T extends object>(value: object): T {
  return value as T;
}

/**
 * A prototype attachment: everything the load-time mixin wiring ever writes
 * through a `writable` view is a method (of any signature — the value is
 * never invoked through this view) or a `true` symbol-brand — nothing else
 * can be attached. `undefined` is present only because reads of a
 * dynamically-keyed view are undefined-aware (`noUncheckedIndexedAccess`) and
 * the wiring aliases one prototype slot to another (read feeds write).
 */
type Attachable = CallableFunction | boolean | undefined;

/**
 * A writable, dynamically-keyed view of a prototype, for attaching mixin
 * methods, aliases, symbol brands and transducer keys at load time.
 * Looseness on the SHAPE is the point — the attached members' precise types
 * are declared where they are *read* (interfaces / `declare`), deliberately
 * decoupled from the prototype-assignment identity — but the VALUES are
 * pinned to methods and brands: a data value can never be smuggled onto a
 * prototype through this view.
 */
export function writable(proto: object): Record<PropertyKey, Attachable> {
  return proto as Record<PropertyKey, Attachable>;
}
