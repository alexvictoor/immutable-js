'use strict';
const { fc, key } = require('../gen');

const num = x => (typeof x === 'number' ? x : 0);

const setOp = fc.oneof(
  fc.record({ t: fc.constant('add'), v: key }),
  fc.record({ t: fc.constant('delete'), v: key }),
  fc.record({ t: fc.constant('clear') }),
  fc.record({ t: fc.constant('union'), arr: fc.array(key, { maxLength: 4 }) }),
  fc.record({ t: fc.constant('intersect'), arr: fc.array(key, { maxLength: 4 }) }),
  fc.record({ t: fc.constant('subtract'), arr: fc.array(key, { maxLength: 4 }) }),
  fc.record({ t: fc.constant('map') }),
  fc.record({ t: fc.constant('filter') }),
  fc.record({ t: fc.constant('flatMap') }),
  fc.record({ t: fc.constant('sort') })
);

function applySet(ctor) {
  return function (Imm, ops) {
    let s = Imm[ctor]();
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      try {
        switch (op.t) {
          case 'add': s = s.add(op.v); break;
          case 'delete': s = s.delete(op.v); break;
          case 'clear': s = s.clear(); break;
          case 'union': s = s.union(op.arr); break;
          case 'intersect': s = s.intersect(op.arr); break;
          case 'subtract': s = s.subtract(op.arr); break;
          case 'map': s = s.map(x => (typeof x === 'number' ? x * 2 : x)); break;
          case 'filter': s = s.filter(x => typeof x !== 'number' || x % 2 === 0); break;
          case 'flatMap': s = s.flatMap(x => [x]); break;
          case 'sort': s = s.sort(); break;
        }
        if (s && typeof s.size === 'number') { void s.size; }
      } catch (e) {
        return Imm.Map({ __throw: i, name: String(e && e.name) });
      }
    }
    return s;
  };
}

function querySet(ctor) {
  return function (Imm, arr) {
    const s = Imm[ctor](arr);
    const other = Imm[ctor](arr.slice(0, 2).concat(['x']));
    return Imm.Map({
      size: s.size,
      has1: s.has(1),
      isSubset: s.isSubset(other),
      isSuperset: s.isSuperset(other),
      unionSize: s.union(other).size,
      intersectSize: s.intersect(other).size,
      subtractSize: s.subtract(other).size,
      reduce: s.reduce((a, x) => a + num(x), 0),
      toListSize: s.toList().size,
    });
  };
}

module.exports = function register(checkParity) {
  const arrArb = fc.array(key, { maxLength: 18 });
  for (const ctor of ['Set', 'OrderedSet']) {
    checkParity(`${ctor} / op-log`, fc.array(setOp, { maxLength: 40 }), applySet(ctor));
    checkParity(`${ctor} / queries`, arrArb, querySet(ctor));
  }
};
