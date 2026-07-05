# Golden-master parity suite

A behavioral safety net for the JavaScript → TypeScript migration of `src/`.
It uses **property-based testing** (fast-check) with a **golden-master**
methodology: thousands of randomly generated operation sequences are applied to
the code under migration and to reference implementations, and the results are
compared.

## The three implementations

| name | what | role |
| --- | --- | --- |
| **candidate** | `dist/immutable.js` — the build produced from this repo's `src/`. Rebuild with `npm run build:dist`. | the code under migration |
| **baseline** | the frozen pre-migration JS build, compiled automatically by [`bootstrap.js`](./bootstrap.js) from the pinned pre-migration commit (`a0e0b161b`, "5.0.3") and cached in `golden-master/.cache/` | the authoritative regression oracle |
| **oracle** | the latest **published** `immutable` package, npm-installed automatically by `bootstrap.js` into `golden-master/.cache/` | parity target requested by the goal |

Both reference builds bootstrap themselves on first run (and after deleting
`golden-master/.cache/`); no manual setup is required. `GM_BASELINE` /
`GM_ORACLE` env vars override the cached paths.

## What is asserted

For every generated input:

1. **`candidate ≡ baseline` — HARD.** The migrated code must reproduce the
   pre-migration behavior *exactly*. A mismatch is a migration regression and
   fails the suite. This is the real guard while converting files.
2. **`candidate ≡ oracle` — parity with the published version.** When this
   fails, the harness checks whether `baseline ≢ oracle`; since `candidate ≡
   baseline` already held, such a case is a *pre-existing difference between the
   two package versions*, not something the migration introduced. These are
   counted and reported, never failed.

Comparison goes through [`normalize.js`](./normalize.js), which walks each
structure with its **own** library's predicate functions and reduces it to
tagged plain-array form. This is necessary because `Immutable.is` cannot compare
values across two independent copies of the library. The tag records the
concrete collection kind, so a `Map` and an `OrderedMap` with the same entries
do **not** compare equal.

## Known cross-version differences (baseline ≢ oracle)

These are real behavioral changes between the repo's version (5.0.3) and the
published 5.1.9, all in lazy `Seq` edge cases, e.g.:

- `Seq([]).takeWhile(...).concat([x]).skip(1).toList()` materializes
  differently (`toArray()` agrees; `toList()` does not).
- `concat` on certain derived seqs returns a type that has/lacks `interpose`.

The migration must preserve the **5.0.3** behavior (match `baseline`), so these
are reported as informational cross-version diffs, not failures.

## Running

```sh
npm run build:dist        # refresh the candidate build
node golden-master/run.js # or: npm run golden
```

The first run builds the baseline (temporary git worktree at the pinned
commit, reusing this repo's `node_modules`) and installs the oracle; both are
cached in `golden-master/.cache/`.

Related tools sharing the same bootstrap: `node golden-master/perf-compare.js`
(candidate-vs-baseline benchmark deltas over `perf/*.js`) and
`node golden-master/probe.js` (baseline-vs-published divergence probe).

Env vars: `GM_RUNS` (iterations per suite, default 1500), `GM_CANDIDATE`,
`GM_BASELINE`, `GM_ORACLE` (module paths).
