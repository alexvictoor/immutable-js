'use strict';
/*
 * Performance regression check: candidate (this repo's current dist build)
 * vs baseline (the frozen pre-migration JS build).
 *
 * Reuses the repo's own perf/*.js benchmark definitions and Benchmark.js,
 * running each `it(...)` against both modules and reporting the delta.
 *
 *   node golden-master/perf-compare.js
 */
const Benchmark = require('benchmark');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ensureBaseline } = require('./bootstrap');

const CANDIDATE_PATH = path.resolve(__dirname, '..', 'dist', 'immutable.js');
const BASELINE_PATH = ensureBaseline();
const perfDir = path.resolve(__dirname, '..', 'perf');
const MAX_TIME = Number(process.env.PERF_MAX_TIME || 0.6); // sec per case

function loadModule(file) {
  const source = fs.readFileSync(file, 'utf8');
  const mod = { exports: {} };
  vm.runInNewContext(
    source,
    { require, module: mod, exports: mod.exports },
    file
  );
  return mod.exports;
}

const candidate = loadModule(CANDIDATE_PATH);
const baseline = loadModule(BASELINE_PATH);
const modules = [candidate, baseline]; // index 0 = new, 1 = old

// Collect tests from perf/*.js for each module (mirrors resources/benchmark.js).
const tests = {};
for (let version = 0; version < modules.length; version++) {
  const Immutable = modules[version];
  for (const filepath of fs.readdirSync(perfDir)) {
    const source = fs.readFileSync(path.join(perfDir, filepath), 'utf8');
    const description = [];
    let beforeFn;
    let prevBeforeFn;
    const beforeStack = [];

    function describe(name, fn) {
      description.push(name);
      beforeStack.push(prevBeforeFn);
      prevBeforeFn = beforeFn;
      fn();
      beforeFn = prevBeforeFn;
      prevBeforeFn = beforeStack.pop();
      description.pop();
    }
    function beforeEach(fn) {
      beforeFn = !prevBeforeFn
        ? fn
        : (prev => () => {
            prev();
            fn();
          })(prevBeforeFn);
    }
    function it(name, test) {
      const fullName = description.join(' > ') + ' ' + name;
      (
        tests[fullName] ||
        (tests[fullName] = { description: fullName, tests: [] })
      ).tests[version] = { before: beforeFn, test };
    }

    vm.runInNewContext(
      source,
      { describe, it, beforeEach, console, Immutable },
      filepath
    );
  }
}

const results = [];
const keys = Object.keys(tests);

function runOne(i) {
  if (i >= keys.length) {
    return summarize();
  }
  const t = tests[keys[i]];
  const suite = new Benchmark.Suite(t.description);
  [0, 1].forEach(version => {
    const spec = t.tests[version];
    if (spec) {
      suite.add(version === 0 ? 'new' : 'old', spec.test, {
        onStart: spec.before,
        maxTime: MAX_TIME,
      });
    }
  });
  suite.on('complete', function () {
    const newBench = this.filter(b => b.name === 'new')[0];
    const oldBench = this.filter(b => b.name === 'old')[0];
    const nHz = newBench.hz;
    const oHz = oldBench ? oldBench.hz : null;
    const delta = oHz ? (nHz - oHz) / oHz : null;
    results.push({ name: t.description, nHz, oHz, delta });
    const d =
      delta === null
        ? ''
        : (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + '%';
    console.log(
      `${d.padStart(8)}  new=${fmt(nHz)}  old=${fmt(oHz)}  ${t.description}`
    );
    runOne(i + 1);
  });
  suite.run({ async: false });
}

function fmt(hz) {
  return hz ? Math.round(hz).toLocaleString() + '/s' : 'n/a';
}

function summarize() {
  const withDelta = results.filter(r => r.delta !== null);
  const mean =
    withDelta.reduce((s, r) => s + r.delta, 0) / (withDelta.length || 1);
  // Geometric mean of new/old ratio is the fair aggregate for throughput.
  const geo = Math.exp(
    withDelta.reduce((s, r) => s + Math.log(r.nHz / r.oHz), 0) /
      (withDelta.length || 1)
  );
  const regressions = withDelta
    .filter(r => r.delta < -0.15)
    .sort((a, b) => a.delta - b.delta);
  console.log('\n──────── summary ────────');
  console.log(`cases compared: ${withDelta.length}`);
  console.log(`mean delta (new vs old): ${(mean * 100).toFixed(1)}%`);
  console.log(
    `geomean throughput ratio (new/old): ${geo.toFixed(3)}  (1.0 = parity)`
  );
  if (regressions.length) {
    console.log(`\n⚠ cases slower by >15%:`);
    regressions.forEach(r =>
      console.log(`  ${(r.delta * 100).toFixed(1)}%  ${r.name}`)
    );
  } else {
    console.log('\n✓ no case slower by more than 15%.');
  }
}

console.log(
  `perf: candidate(dist) vs baseline(pre-migration), maxTime=${MAX_TIME}s/case\n`
);
runOne(0);
