# Immutable.js — JavaScript → TypeScript migration

This document records the complete conversion of the `src/` implementation from
JavaScript to strict TypeScript: the goal, the safety net, the build changes,
the per-layer migration, the architectural problems encountered and how each was
solved, the regressions the safety net caught, and how to reproduce every check.

---

## 1. Goal & acceptance criteria

Convert the entire `src/` tree from JS to TS such that:

- there are **no `.js` source files** — only `.ts`;
- **no `any` keyword** and **no dangerous casts**;
- **generic types** throughout;
- **zero TypeScript errors** under the strictest reasonable configuration;
- behavior is provably unchanged, verified with a **golden-master** methodology
  plus **property-based testing** (fast-check) against the **latest published
  `immutable`** fetched into a temporary folder.

### Final state (all verified)

| Check | Result |
| --- | --- |
| `.js` source files | **0** (75 files → `.ts`, +1 new `internalTypes.ts`) |
| `any` keyword in `src` | **0** |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** |
| `tsc` under maximal-strict `src/tsconfig.json` | **0 errors** |
| eslint on `src` (enforces `no-explicit-any`, `ban-ts-comment`) | **0 errors** |
| public `type-definitions/immutable.d.ts` type-check | **0 errors** |
| `__tests__` type-check | **0 errors** |
| production build (umd / es / min) | builds cleanly |
| golden-master vs published `immutable@5.1.9` | **19/19 suites** |
| jest unit suite | **693/693 tests** |

---

## 2. The safety net (built first, before touching any source)

The single most important artifact. It lives in [`golden-master/`](./golden-master)
and uses **fast-check** property tests with a **golden-master** methodology.

### Three implementations compared

| name | what | role |
| --- | --- | --- |
| **candidate** | `dist/immutable.js` — the build from this repo's `src/` | the code under migration |
| **baseline** | a frozen copy of the *pre-migration* JS build (same version), stored in the scratch temp folder | the authoritative regression oracle |
| **oracle** | the latest **published** `immutable` (`npm install immutable@latest` → `5.1.9`), installed into a temp folder | parity target requested by the goal |

### What is asserted (per generated input)

1. **`candidate ≡ baseline` — HARD.** The migrated code must reproduce the
   pre-migration behavior *exactly*. A mismatch is a migration regression and
   fails the suite. This is the real guard while converting files.
2. **`candidate ≡ oracle` — parity with the published version.** When this
   fails, the harness verifies `baseline ≢ oracle` and records it as a
   *pre-existing cross-version difference* (5.0.3 vs 5.1.9), never a failure.

### How comparison works across two copies of the library

`Immutable.is` cannot compare values across two independently-loaded copies of
the library (it relies on brand symbols). So [`golden-master/normalize.js`](./golden-master/normalize.js)
walks each structure with **its own** library's predicate functions
(`isKeyed`, `isIndexed`, `isOrdered`, …) and reduces it to a tagged plain-array
form. The tag records the concrete collection kind, so a `Map` and an
`OrderedMap` with the same entries do **not** compare equal — a migration that
silently changed a type would be caught.

### Coverage

Model-based operation-logs (fast-check generates random sequences of operations
applied identically to all implementations) across: **List, Map, OrderedMap,
Set, OrderedSet, Stack** (op-logs + query suites), **Seq** (lazy op-logs),
**Range, Repeat, Record, fromJS/toJS, the functional API, `is`/`hashCode`, and
cross-type conversions**.

### Known, documented cross-version differences

A handful of real behavior changes between this repo's version (5.0.3) and the
published 5.1.9 exist, all in lazy `Seq` edge cases (e.g.
`Seq([]).takeWhile(...).concat([x]).skip(1).toList()` materializes differently;
`toArray()` agrees, `toList()` doesn't). The migration must preserve the **5.0.3**
behavior (match `baseline`), so these are reported as informational, not failures.

### Running it

```sh
npm run build:dist        # refresh the candidate build
node golden-master/run.js # or: npm run golden
```

---

## 3. Build & tooling changes

The key decision: **decouple transpilation from type-checking**. The build only
strips types (it never fails on a type error, so golden-master can always run);
`tsc --noEmit` enforces strictness separately.

- **`resources/rollup-ts-transpile.mjs`** (new) — a transpile-only Rollup plugin
  using `ts.transpileModule` at **ES5 target** (matching the previous buble step,
  so `class` down-levels to functions callable without `new`). Handles both
  `.ts` and `.js` during the transition. Emit helpers are suppressed per
  module and provided once by a shared virtual module, so the bundle carries
  a single `__extends`.
- **`resources/rollup-config.mjs`** — buble removed; now uses `nodeResolve`
  (extensions `.ts,.js,.mjs,.json`) + the transpile plugin. Entry auto-detects
  `Immutable.ts`/`.js`.
- **`resources/jestPreprocessor.js`** — `src/` files bundled through the same
  Rollup pipeline (ES5, callable-without-`new`); test files transpiled at ES2015.
- **`resources/jestResolver.js`** — resolves `immutable` to `Immutable.ts` when
  present.
- **`src/tsconfig.json`** (new) — maximal strictness: `strict`, `noImplicitAny`,
  `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`,
  `strictPropertyInitialization`, `useUnknownInCatchVariables`,
  `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`,
  `noUnusedLocals`, `noUnusedParameters`, `allowUnreachableCode:false`.
  `noImplicitOverride` is intentionally **off** — in a mixin architecture a class
  method routinely "overrides" a member inherited only through a merged public
  interface, so the keyword adds churn with no soundness benefit.
- **`.eslintrc.json`** — a `src/**/*.ts` override sets `no-explicit-any: error`
  and `ban-ts-comment: error`, and disables a few opinion/style rules that
  *conflict* with strict TS (notably `dot-notation`, which fights
  `noPropertyAccessFromIndexSignature`; and `no-useless-constructor`, which
  false-positives on TS parameter-property constructors).
- **`package.json`** — added `type-check:src`, `golden`, `golden:run` scripts and
  `fast-check` + `@rollup/plugin-node-resolve` devDependencies.

---

## 4. Migration strategy

**Bottom-up, dependency-ordered, keeping golden-master + jest green throughout.**
The build's transpile-only nature meant all files could be renamed `.js` → `.ts`
in one sweep (behavior identical), then typed incrementally while `tsc` reported
what remained. Progress: **1827 → 0** `tsc` errors.

Order (each fully typed & verified before moving on):

1. **Foundation leaves** — `utils/*` (arrCopy, invariant, isArrayLike, isPlainObj,
   mixin, quoteString, shallowCopy, assertNotInfinite, hasOwnProperty),
   `Math`, `PairSorting`, `Iterator`, `Hash`, `TrieUtils`, `is`, and a new
   `internalTypes.ts` (the shared internal vocabulary).
2. **Predicates** (`predicates/*`) — typed as type-guards (`x is …`) narrowing to
   the public generic interfaces.
3. **Base classes** — `Collection` (Keyed/Indexed/Set).
4. **`Seq`** family (Seq, KeyedSeq, IndexedSeq, SetSeq, ArraySeq, ObjectSeq,
   CollectionSeq) — the template that validated the whole approach.
5. **`functional/*`** and **`methods/*`** (the free-function API and the
   prototype-mixin helpers).
6. **Concrete collections** — `Range`, `Repeat`, `Stack`, `Map` (HAMT),
   `Set`, `List` (VNode trie), `OrderedMap`, `OrderedSet`, `Record`.
7. **`Operations`** (lazy operation factories + wrapper seqs) and
   **`CollectionImpl`** (the shared mixin methods) — the two largest, last.
8. **`toJS`, `fromJS`, `deepEqual`**, and the `Immutable` entry point.

---

## 5. Architectural problems & how they were solved

The library uses a runtime style that is fundamentally at odds with TS classes.
Each problem and its resolution:

### 5.1 "Classes" called without `new` + return-override constructors

`Map(value)`, `List(value)`, `Seq(value)` are invoked as *functions*, and their
constructors `return` a coerced/existing instance. Native ES classes can't be
called without `new`, and TS requires `super()` in derived constructors — but
adding `super()` naively causes **infinite factory recursion** (`Collection`'s
factory calls `Seq`, which would `super()` back into `Collection`).

**Solution:** a shared private **`CONSTRUCT` sentinel** (`TrieUtils.ts`). Every
subclass constructor calls `super(CONSTRUCT)`; a base constructor seeing the
sentinel skips its coercion and merely constructs. This satisfies the derived-
`super` rule *and* breaks the recursion, with behavior preserved. Internal bare
factory calls (`Seq(value)`) became `new Seq(value)` — behavior-identical because
the constructors return-override (verified by golden-master).

### 5.2 The `mixin()` prototype pattern

Hundreds of methods are attached at load time via `mixin(Collection, {…})` rather
than declared on the class, so TS can't see them and the object-literal method
bodies have an untyped `this`.

**Solution:** two complementary techniques —
- **Declaration merging**: each class is merged with an `interface` of the same
  name that `extends` the precise **public** generic interface
  (`type-definitions/immutable.d.ts`) plus an internal-methods interface. Instances
  are therefore fully typed with real generics.
- **`ThisType<T>`**: the mixin object literals are annotated
  `{ [k]: unknown } & ThisType<CollectionThis>`, so every method body sees `this`
  as the full collection surface (`CollectionThis` is the internal
  "everything a body touches" interface). Method *return* types are irrelevant
  (the class API comes from the merged interfaces); only the bodies are checked.

### 5.3 Trie internals

The HAMT nodes (`ArrayMapNode`, `BitmapIndexedNode`, `HashArrayMapNode`,
`HashCollisionNode`, `ValueNode`) and List `VNode`s store mixed child-nodes/values.
Typed with a structural `MapNode` interface and `Array<unknown>` payloads —
**`unknown`, never `any`** — so every access must be narrowed.

### 5.4 `size` variance

Lazy `Seq`s have `size: number | undefined`; concrete collections always have
`number`. The base internal interface declares `number | undefined`; concrete
classes **re-declare `size: number`** (a legal narrowing), removing dozens of
`as number` casts.

### 5.5 Public/internal type split

The shipped `.d.ts` is a **consumer** contract (`readonly` fields, refined method
returns, occasional `any`); the implementation needs **mutable** transient writes
and internal `__`-methods. Reconciling them:
- base `Collection` carries only internal methods, so subtypes can extend the
  *refined* `Collection.Keyed`/`.Indexed`/`.Set` without "cannot simultaneously
  extend" conflicts;
- the step-function param dropped its `this` polymorphism (which conflicted when
  inherited via two paths);
- the internal `Seq` base omits the refined API (which differs per Keyed/Indexed/
  Set), keeping only non-refined members its own body uses.

---

## 6. Cast-minimization techniques (per review feedback)

To keep casts to a genuine minimum:

- **Branded `NOT_SET` + `isNotSet` type guard** — `NOT_SET` carries a nominal
  brand so a user-defined type guard `isNotSet(v): v is NotSet` narrows a
  `T | NotSet` union to `T` in the else-branch (raw `===` can't narrow object
  identity; a guard can, via `Exclude`). Removed the `as V` casts throughout.
- **1-arg `get` overloads** — `get(k): V | undefined` alongside
  `get<NSV>(k, notSetValue): V | NSV`, so `get(k)` returns `V | undefined`
  cast-free (a bare generic call otherwise infers `unknown`).
- **Assertion function `invariant(cond): asserts cond`** — narrows guarded values
  without a follow-up cast.
- **Single downcasts** where the runtime type is a subtype (e.g.
  `IndexedCollection → Stack`), avoiding `as unknown as`.

### Remaining casts (audited — none are "dangerous")

A dedicated expert pass eliminated the double-casts: **79 → 1**
`as unknown as` (the survivor is the documented `Set.union` string quirk, where
a *primitive* is added whole as a `K`; primitives can't flow through the
object-constrained helper below). Techniques used:

- **[`src/utils/reinterpret.ts`](./src/utils/reinterpret.ts)** — the single
  audited home for view-bridging. `viewAs<T extends object>(value: object)` (46
  sites) and `writable(proto: object)` (18 sites) each contain one legal single
  cast (`object → T` is comparable); every unsafe reinterpretation in the
  library is now greppable and constrained so primitives can never be recast.
- **Method-syntax structural views** — `OpSeq`'s members were switched from
  function-property to *method* syntax: under `strictFunctionTypes` only
  property syntax is contravariant, so bivariant methods make real collections
  comparable to the `unknown`-typed view with a plain single `as`.
- **True removals**: `declare static Iterator` on `Collection` (no cast);
  Record now imports `hasIn`/`toObject` directly instead of plucking them off
  `CollectionPrototype` through an index-signature view (same functions);
  `arguments as ArrayLike<T>` and the shared-empty singletons proved single-cast
  comparable (`Stack`'s via an `unknown`-parameterized singleton);
  the faithful `(bool as unknown as number) & MASK` List quirk became
  `(cond ? 1 : 0) & MASK`; a post-filter `entry!` non-null assertion replaced an
  OrderedMap cast; `CollectionThis` gained `toString()`.

Totals: **~305** single `as` (narrowing/downcasts), **1** `as unknown as`,
**0** `any`. (A post-migration quality pass replaced several casts with
overloads, shared bases and `declare size: number` re-declarations; see
`src/utils/reinterpret.ts`'s header for the audited exceptions that keep a
bare `as`.)

---

## 7. Regressions the safety net caught (and fixed)

Proof the golden-master + jest gate works — three real behavior bugs I
introduced during typing were caught and fixed:

1. **Record empty-merge identity** — a blanket `new X()` conversion changed
   `collection.constructor(source)` (a *plain* call, on which a Record factory
   returns the shared empty instance) to `new` (which returns a fresh instance).
   `emptyRecord.merge({id:1})` stopped being `=== emptyRecord`. Fixed by keeping
   the two `.constructor()` factory-coercion calls as plain calls.
2. **OrderedMap hole iteration** — I "cleaned" `entry && fn(...)` to
   `!!entry && fn(...)`; the former returns `undefined` on a hole (continue), the
   latter returns `false` (abort). Golden-master dropped to 15/19; reverted.
3. **List.clear `null` vs `undefined`** — I set `_root/_tail = null`; the original
   uses `undefined`, so `get(0)` after clear returned `null` instead of
   `undefined`. Reverted to match.

---

## 7b. Performance (no regression)

The build pipeline changed (buble → `ts.transpileModule`, both ES5) and some
constructors gained `super(CONSTRUCT)` calls, so throughput was checked
directly. [`golden-master/perf-compare.js`](./golden-master/perf-compare.js)
runs the repo's own `perf/*.js` suites (List/Map/Record/toJS) through
Benchmark.js against **both** the candidate build and the frozen pre-migration
build, reporting the per-case delta and a geometric-mean throughput ratio.

```sh
node golden-master/perf-compare.js       # PERF_MAX_TIME=<sec> to tune
```

**Result: candidate is at parity or slightly faster — geomean throughput ratio
≈ 1.03 (new/old), no case slower than 15%.** Record property/`get` access is
notably faster (+13–41%, the TS ES5 accessor output beats buble's); List/Map
build/push/merge are within noise (±3%).

**One regression was found and fixed.** Typing `List.push`/`unshift` and
`Stack.push` as `push(...values)` made the ES5 output allocate+copy an array
from `arguments` on **every** call — measurable on the hot transient-push path
(−8% at 1024 pushes, scaling with call count). Fixed by keeping the variadic
**type** via an overload signature while implementing the body with `arguments`
(no rest param → no per-call copy):

```ts
push(...values: Array<T>): List<T>;   // type only
push(): List<T> {
  const values = arguments as unknown as ArrayLike<T>;
  // …
}
```

After the fix those cases returned to ±2% (noise). This is the kind of
transpilation-level regression a type-only migration can silently introduce, and
why the benchmark comparison was run.

## 7c. Post-review regression fixes (found by high-effort adversarial review)

A workflow-based review (27 agents, every finding verified by executing
counterexamples against both builds) found regressions the original golden-master
generators missed. All were fixed **test-first** (failing test → fix → green);
the pinning tests live in `__tests__/Seq.ts`, `__tests__/Map.ts`,
`__tests__/flatten.ts`.

1. **`takeWhile` falsy non-boolean predicates** (`Operations.ts`) — a `!!`
   added during typing broke the load-bearing `&&` chain: a falsy-but-not-
   `false` predicate result (e.g. `0`) must *skip the entry but keep scanning*
   in the `__iterate` path (`Seq([1,2,3]).takeWhile(x => x % 2).toArray()` is
   `[1,3]`, and `List(...)` gives `[1,undefined,3]` — quirky but shipped).
   The coercion was removed; a comment marks the chain as load-bearing.
2. **`Map.deleteAll` infinite hang** (`Map.ts`) — swapping `forEach` for
   `__iterate` lost `forEach`'s `assertNotInfinite` guard;
   `Map({a:1}).deleteAll(Repeat('a'))` hung instead of throwing. The assert
   was restored at the same evaluation point.
3. **Reversed flattened-seq iterator keys** (`Operations.ts`) — the rewrite of
   `flattenFactory.__iteratorUncached` dropped the
   `if (reverse) return this.cacheResult().__iterator(...)` fallback,
   renumbering keys on reversed iteration. Guard restored.
4. **`reverseFactory` iterator crash faithfully preserved** — the original
   source read `this.size` inside an arrow capturing module-level `this`
   (undefined in the shipped bundle), so reversed re-iteration of a reversed
   unkeyed seq **always threw a TypeError** — and published **5.1.9 also
   throws** on this path (a different TypeError). The migration had silently
   made it "work" — behavior no released version has. The always-throw branch
   is now explicit (`throw new TypeError(...)` with a comment explaining the
   history) rather than accidental.

**Generator hardening** (`golden-master/suites/seq.js`): predicates returning
falsy non-booleans (`takeWhileFalsy`/`skipWhileFalsy`), a keyed-flatten op, and
materialization through **both** protocols (`toList()` via `__iterate` *and*
draining `entries()` via `__iterator` — they can diverge independently).
Detection was proven by injecting the `!!` bug into the built artifact:
the hardened suite fails `Seq / lazy op-log` with `REGRESSION vs baseline`;
restoring the fix returns 19/19 (verified across multiple seeds and at
`GM_RUNS=4000`).

Known remaining review findings (intentionally deferred): `viewAs`'s
unconstrained target type. Findings deferred by earlier revisions and since
fixed: the null-prototype `isArrayLike` deviation, the Record
`hasOwnProperty`-field deviation, the unguarded top-level `Symbol()` (the
CONSTRUCT token is now a branded plain object, keeping Symbol-less ES5
engines working), the per-instance `MapIterator.next` closure (back on the
prototype, restoring the 5.0.x iterator shape), the 5.0.x TypeError parity in
`Seq`/`updateIn`/reversed-unkeyed iteration, `not()`/`neg()` rest-param
allocations, the duplicated `__extends` emit helper (now shared, one copy in
the bundle), and the golden-master scratchpad paths — the baseline/oracle now
self-bootstrap via `golden-master/bootstrap.js` into a gitignored cache, so
`npm run golden` and `perf-compare.js`/`probe.js` run on any machine.

## 8. Key files

**New**
- `src/internalTypes.ts` — shared internal type vocabulary (`IterateType`,
  `SideEffect`, `ImmutableIterator`, `InternalCollectionMethods`,
  `SeqInternalMethods`, `IterableLike`, `Ref`, `ValueObject`).
- `golden-master/` — `run.js`, `harness.js`, `normalize.js`, `gen.js`,
  `suites/*`, `README.md`, plus `probe.js`.
- `resources/rollup-ts-transpile.mjs`, `src/tsconfig.json`, this file.

**Every `src/**/*.js` → `.ts`** (75 files). Notable internal additions in
`TrieUtils.ts`: `CONSTRUCT` sentinel, `OwnerID` (now a class), branded
`NOT_SET`/`NotSet` + `isNotSet` guard.

---

## 9. How to reproduce every check

```sh
npm ci

# strict type-check of the migrated source (0 errors)
npx tsc --project src/tsconfig.json

# lint the source (enforces no-explicit-any, ban-ts-comment)
npx eslint "src/**/*.ts"

# behavioral parity vs the latest published immutable (19/19)
npm run golden        # builds dist, installs oracle if needed, runs suites

# existing unit tests (693/693)
npx jest

# performance vs pre-migration build (geomean ≈ 1.03, no >15% regression)
node golden-master/perf-compare.js

# public d.ts + tests still type-check
npx tsc --project type-definitions/tsconfig.json
npx tsc --project __tests__/tsconfig.json

# audits
find src -name '*.js' | wc -l                      # 0
grep -rn '\bany\b' src --include='*.ts'            # only comments
grep -rnE '@ts-(ignore|expect-error|nocheck)' src  # none
```
