'use strict';
/*
 * Golden-master harness (three-way).
 *
 *   candidate = build from THIS repo's src/ (dist/immutable.js) — the code
 *               under migration. Rebuild with `npm run build:dist`.
 *   baseline  = a frozen copy of the pre-migration JS build (same version as
 *               candidate). This is the authoritative regression oracle: the
 *               migration must reproduce it EXACTLY.
 *   oracle    = the latest published `immutable`, installed into a temporary
 *               folder (scratchpad). The migrated code must behave like it
 *               everywhere the two package versions actually agree.
 *
 * For every generated input we require:
 *   (1) candidate ≡ baseline           — HARD. A mismatch is a migration
 *                                          regression and fails the suite.
 *   (2) candidate ≡ oracle             — parity with the published version.
 *                                          When this fails we check whether
 *                                          baseline ≢ oracle; if so it is a
 *                                          pre-existing cross-version
 *                                          difference (recorded, not failed),
 *                                          not something the migration caused.
 *
 * Comparison goes through `normalize`, which walks each structure with its own
 * library's predicates and reduces it to tagged plain arrays, so it works
 * across independent copies of the library.
 */
const path = require('path');
const fc = require('fast-check');
const { makeNormalizer, deepEqual } = require('./normalize');
const { ensureBaseline, ensureOracle } = require('./bootstrap');

const CANDIDATE_PATH =
  process.env.GM_CANDIDATE || path.resolve(__dirname, '..', 'dist', 'immutable.js');
const BASELINE_PATH = ensureBaseline();
const ORACLE_PATH = ensureOracle();

const Candidate = require(CANDIDATE_PATH);
const Baseline = require(BASELINE_PATH);
const Oracle = require(ORACLE_PATH);

const normCandidate = makeNormalizer(Candidate);
const normBaseline = makeNormalizer(Baseline);
const normOracle = makeNormalizer(Oracle);

const NUM_RUNS = process.env.GM_RUNS ? parseInt(process.env.GM_RUNS, 10) : 1500;

const results = [];
let versionDiffTotal = 0;

function checkParity(name, arbitrary, run) {
  let versionDiffs = 0;
  const diffExamples = [];
  try {
    fc.assert(
      fc.property(arbitrary, input => {
        const nc = normCandidate(run(Candidate, input));
        const nb = normBaseline(run(Baseline, input));
        // (1) HARD regression guard: migrated code must match the frozen
        //     same-version baseline exactly.
        if (!deepEqual(nc, nb)) {
          throw new Error(
            'REGRESSION vs baseline\n candidate: ' +
              JSON.stringify(nc) +
              '\n baseline:  ' +
              JSON.stringify(nb)
          );
        }
        // (2) Parity vs published oracle.
        const no = normOracle(run(Oracle, input));
        if (!deepEqual(nc, no)) {
          // Since nc === nb here, this is a genuine pre-existing difference
          // between the two package versions, not a migration regression.
          versionDiffs++;
          if (diffExamples.length < 3) {
            diffExamples.push({
              input,
              candidate: nc,
              oracle: no,
            });
          }
        }
        return true;
      }),
      { numRuns: NUM_RUNS, verbose: false }
    );
    versionDiffTotal += versionDiffs;
    results.push({ name, ok: true, versionDiffs, diffExamples });
    const note =
      versionDiffs > 0
        ? `  (~${versionDiffs} cross-version diffs vs published — baseline-matched, not a regression)`
        : '';
    console.log(`  ok   ${name}${note}`);
  } catch (e) {
    results.push({ name, ok: false, error: e });
    console.log(`  FAIL ${name}`);
    console.log('       ' + String(e.message).split('\n').slice(0, 16).join('\n       '));
    if (e && e.counterexample !== undefined) {
      console.log('       counterexample: ' + JSON.stringify(e.counterexample).slice(0, 400));
    }
  }
}

function summary() {
  const failed = results.filter(r => !r.ok);
  console.log('');
  console.log(
    `golden-master: ${results.length - failed.length}/${results.length} suites passed` +
      ` (${versionDiffTotal} cross-version diffs vs published, all baseline-matched)`
  );
  return failed.length;
}

module.exports = { fc, checkParity, summary, Candidate, Baseline, Oracle, NUM_RUNS };
