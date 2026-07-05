'use strict';
const { fc, scalar } = require('../gen');

const num = x => (typeof x === 'number' ? x : 0);

const seqOp = fc.oneof(
  fc.record({ t: fc.constant('map') }),
  fc.record({ t: fc.constant('filter') }),
  fc.record({ t: fc.constant('take'), n: fc.integer({ min: 0, max: 12 }) }),
  fc.record({ t: fc.constant('skip'), n: fc.integer({ min: 0, max: 12 }) }),
  fc.record({ t: fc.constant('flatMap') }),
  fc.record({ t: fc.constant('reverse') }),
  fc.record({ t: fc.constant('cacheResult') }),
  fc.record({ t: fc.constant('concat'), arr: fc.array(scalar, { maxLength: 4 }) }),
  fc.record({ t: fc.constant('interpose'), v: scalar }),
  fc.record({ t: fc.constant('takeWhile') }),
  // Predicates returning falsy NON-boolean values (0 here): the legacy `&&`
  // chains treat these differently from `false` — regression class caught by
  // the post-migration review (takeWhile `!!` coercion bug).
  fc.record({ t: fc.constant('takeWhileFalsy') }),
  fc.record({ t: fc.constant('skipWhileFalsy') }),
  fc.record({ t: fc.constant('flattenKeyed') })
);

function applySeq(Imm, cfg) {
  let seq = Imm.Seq(cfg.init);
  for (let i = 0; i < cfg.ops.length; i++) {
    const op = cfg.ops[i];
    try {
      switch (op.t) {
        case 'map': seq = seq.map(x => num(x) + 1); break;
        case 'filter': seq = seq.filter(x => num(x) % 2 === 0); break;
        case 'take': seq = seq.take(op.n); break;
        case 'skip': seq = seq.skip(op.n); break;
        case 'flatMap': seq = seq.flatMap(x => [x, x]); break;
        case 'reverse': seq = seq.reverse(); break;
        case 'cacheResult': seq = seq.cacheResult(); break;
        case 'concat': seq = seq.concat(op.arr); break;
        case 'interpose': seq = seq.interpose(op.v); break;
        case 'takeWhile': seq = seq.takeWhile(x => num(x) < 5); break;
        case 'takeWhileFalsy': seq = seq.takeWhile(x => num(x) % 2); break;
        case 'skipWhileFalsy': seq = seq.skipWhile(x => num(x) % 2); break;
        case 'flattenKeyed': seq = seq.flatMap(x => [[x]]).toKeyedSeq().flatten(true); break;
      }
    } catch (e) {
      return Imm.Map({ __throw: i, name: String(e && e.name) });
    }
  }
  try {
    // Materialize through BOTH protocols: __iterate (toList) and the
    // iterator protocol via entries() — they can diverge independently
    // (regression class: flatten+reverse iterator key renumbering).
    const viaIterate = seq.toList();
    const viaIterator = [];
    const it = seq.entries();
    let step;
    let guard = 0;
    while (!(step = it.next()).done && guard++ < 200) {
      viaIterator.push(Imm.List(step.value));
    }
    return Imm.List([viaIterate, Imm.List(viaIterator)]);
  } catch (e) {
    return Imm.Map({ __throw: 'materialize', name: String(e && e.name) });
  }
}

// Range / Repeat materialization and lazy transforms.
function rangeCase(Imm, c) {
  const r = Imm.Range(c.start, c.end, c.step === 0 ? 1 : c.step);
  return Imm.Map({
    size: r.size,
    arr: r.take(20).toArray(),
    sum: r.take(20).reduce((a, x) => a + x, 0),
    mapped: r.take(10).map(x => x * 2).toArray(),
    filtered: r.take(20).filter(x => x % 2 === 0).toArray(),
    includes: r.includes(c.start),
    last: r.take(50).last(),
  });
}

function repeatCase(Imm, c) {
  const r = Imm.Repeat(c.v, c.n);
  return Imm.Map({
    size: r.size,
    arr: r.toArray(),
    take: r.take(3).toArray(),
    includes: r.includes(c.v),
    mapped: r.map(x => String(x)).toArray(),
  });
}

module.exports = function register(checkParity) {
  checkParity(
    'Seq / lazy op-log',
    fc.record({ init: fc.array(scalar, { maxLength: 12 }), ops: fc.array(seqOp, { maxLength: 12 }) }),
    applySeq
  );
  checkParity(
    'Range',
    fc.record({ start: fc.integer({ min: -10, max: 10 }), end: fc.integer({ min: -10, max: 30 }), step: fc.integer({ min: -4, max: 4 }) }),
    rangeCase
  );
  checkParity(
    'Repeat',
    fc.record({ v: scalar, n: fc.integer({ min: 0, max: 8 }) }),
    repeatCase
  );
};
