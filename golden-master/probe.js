'use strict';
/* Quick divergence probe: frozen baseline (current src) vs published oracle. */
const fc = require('fast-check');
const { makeNormalizer, deepEqual } = require('./normalize');
const { ensureBaseline, ensureOracle } = require('./bootstrap');

const A = require(ensureBaseline()); // frozen pre-migration baseline
const B = require(ensureOracle()); // latest published immutable

const na = makeNormalizer(A);
const nb = makeNormalizer(B);

// A small op-log interpreter applied identically to a collection from each lib.
function runList(Imm, ops) {
  let l = Imm.List();
  for (const op of ops) {
    try {
      switch (op.t) {
        case 'push': l = l.push(op.v); break;
        case 'pop': l = l.pop(); break;
        case 'unshift': l = l.unshift(op.v); break;
        case 'shift': l = l.shift(); break;
        case 'set': l = l.set(op.i, op.v); break;
        case 'delete': l = l.delete(op.i); break;
        case 'insert': l = l.insert(op.i, op.v); break;
        case 'setSize': l = l.setSize(op.i); break;
        case 'slice': l = l.slice(op.i, op.j); break;
        case 'concat': l = l.concat(op.arr); break;
        case 'map': l = l.map(x => (typeof x === 'number' ? x * 2 : x)); break;
        case 'filter': l = l.filter(x => typeof x !== 'number' || x % 2 === 0); break;
        case 'reverse': l = l.reverse(); break;
      }
    } catch (e) {
      return ['throw', op.t];
    }
  }
  return l;
}

function runMap(Imm, ops) {
  let m = Imm.Map();
  for (const op of ops) {
    try {
      switch (op.t) {
        case 'set': m = m.set(op.k, op.v); break;
        case 'delete': m = m.delete(op.k); break;
        case 'update': m = m.update(op.k, 0, x => (typeof x === 'number' ? x + 1 : x)); break;
        case 'merge': m = m.merge(op.obj); break;
        case 'mapKeys': m = m.mapKeys(k => String(k)); break;
        case 'filter': m = m.filter(v => typeof v !== 'number' || v % 2 === 0); break;
      }
    } catch (e) { return ['throw', op.t]; }
  }
  return m;
}

const listOp = fc.oneof(
  fc.record({ t: fc.constant('push'), v: fc.integer({ min: -5, max: 5 }) }),
  fc.record({ t: fc.constant('pop') }),
  fc.record({ t: fc.constant('unshift'), v: fc.integer({ min: -5, max: 5 }) }),
  fc.record({ t: fc.constant('shift') }),
  fc.record({ t: fc.constant('set'), i: fc.integer({ min: -3, max: 8 }), v: fc.integer({ min: -5, max: 5 }) }),
  fc.record({ t: fc.constant('delete'), i: fc.integer({ min: -3, max: 8 }) }),
  fc.record({ t: fc.constant('insert'), i: fc.integer({ min: -3, max: 8 }), v: fc.integer({ min: -5, max: 5 }) }),
  fc.record({ t: fc.constant('setSize'), i: fc.integer({ min: 0, max: 12 }) }),
  fc.record({ t: fc.constant('slice'), i: fc.integer({ min: -5, max: 8 }), j: fc.integer({ min: -5, max: 8 }) }),
  fc.record({ t: fc.constant('concat'), arr: fc.array(fc.integer({ min: -5, max: 5 }), { maxLength: 4 }) }),
  fc.record({ t: fc.constant('map') }),
  fc.record({ t: fc.constant('filter') }),
  fc.record({ t: fc.constant('reverse') })
);

const key = fc.oneof(fc.string({ maxLength: 3 }), fc.integer({ min: -3, max: 3 }));
const mapOp = fc.oneof(
  fc.record({ t: fc.constant('set'), k: key, v: fc.integer({ min: -5, max: 5 }) }),
  fc.record({ t: fc.constant('delete'), k: key }),
  fc.record({ t: fc.constant('update'), k: key }),
  fc.record({ t: fc.constant('merge'), obj: fc.dictionary(fc.string({ maxLength: 3 }), fc.integer({ min: -5, max: 5 }), { maxKeys: 3 }) }),
  fc.record({ t: fc.constant('mapKeys') }),
  fc.record({ t: fc.constant('filter') })
);

let failures = 0;
function check(name, arb, run) {
  try {
    fc.assert(
      fc.property(arb, ops => {
        const ra = run(A, ops);
        const rb = run(B, ops);
        return deepEqual(na(ra), nb(rb));
      }),
      { numRuns: 2000, verbose: false }
    );
    console.log(`  OK   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  DIFF ${name}`);
    console.log('    ' + String(e.message).split('\n').slice(0, 12).join('\n    '));
  }
}

console.log('baseline(5.0.3) vs npm(5.1.9):');
check('List', fc.array(listOp, { maxLength: 30 }), runList);
check('Map', fc.array(mapOp, { maxLength: 30 }), runMap);
console.log(failures === 0 ? 'NO DIVERGENCE' : `${failures} divergence(s)`);
process.exit(failures === 0 ? 0 : 1);
