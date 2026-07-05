'use strict';
const { fc, scalar, key } = require('../gen');

const num = x => (typeof x === 'number' ? x : 0);

const mapOp = kind =>
  fc.oneof(
    fc.record({ t: fc.constant('set'), k: key, v: scalar }),
    fc.record({ t: fc.constant('delete'), k: key }),
    fc.record({ t: fc.constant('update'), k: key }),
    fc.record({ t: fc.constant('updateDef'), k: key }),
    fc.record({ t: fc.constant('clear') }),
    fc.record({ t: fc.constant('merge'), obj: fc.dictionary(fc.string({ maxLength: 3 }), scalar, { maxKeys: 3 }) }),
    fc.record({ t: fc.constant('mergeWith'), obj: fc.dictionary(fc.string({ maxLength: 3 }), fc.integer({ min: -4, max: 4 }), { maxKeys: 3 }) }),
    fc.record({ t: fc.constant('mapKeys') }),
    fc.record({ t: fc.constant('mapEntries') }),
    fc.record({ t: fc.constant('map') }),
    fc.record({ t: fc.constant('filter') }),
    fc.record({ t: fc.constant('filterNot') }),
    fc.record({ t: fc.constant('flip') }),
    fc.record({ t: fc.constant('sortBy') }),
    fc.record({ t: fc.constant('sort') }),
    fc.record({ t: fc.constant('setIn'), k: key, k2: key, v: scalar }),
    fc.record({ t: fc.constant('updateIn'), k: key, k2: key }),
    fc.record({ t: fc.constant('deleteIn'), k: key, k2: key }),
    fc.record({ t: fc.constant('mergeDeep'), obj: fc.dictionary(fc.string({ maxLength: 3 }), fc.dictionary(fc.string({ maxLength: 2 }), scalar, { maxKeys: 2 }), { maxKeys: 2 }) })
  );

function applyMap(ctor) {
  return function (Imm, ops) {
    let m = Imm[ctor]();
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      try {
        switch (op.t) {
          case 'set': m = m.set(op.k, op.v); break;
          case 'delete': m = m.delete(op.k); break;
          case 'update': m = m.update(op.k, x => num(x) + 1); break;
          case 'updateDef': m = m.update(op.k, 100, x => num(x) + 1); break;
          case 'clear': m = m.clear(); break;
          case 'merge': m = m.merge(op.obj); break;
          case 'mergeWith': m = m.mergeWith((a, b) => num(a) + num(b), op.obj); break;
          case 'mapKeys': m = m.mapKeys(k => String(k)); break;
          case 'mapEntries': m = m.mapEntries(([k, v]) => [k, num(v) + 1]); break;
          case 'map': m = m.map(v => num(v) * 3); break;
          case 'filter': m = m.filter(v => typeof v !== 'number' || v % 2 === 0); break;
          case 'filterNot': m = m.filterNot(v => v === null); break;
          case 'flip': m = m.flip(); break;
          case 'sortBy': m = m.sortBy((v, k) => String(k)); break;
          case 'sort': m = m.sort(); break;
          case 'setIn': m = m.setIn([op.k, op.k2], op.v); break;
          case 'updateIn': m = m.updateIn([op.k, op.k2], 0, x => num(x) + 1); break;
          case 'deleteIn': m = m.deleteIn([op.k, op.k2]); break;
          case 'mergeDeep': m = m.mergeDeep(op.obj); break;
        }
        if (m && typeof m.size === 'number') { void m.size; }
      } catch (e) {
        return Imm.Map({ __throw: i, name: String(e && e.name) });
      }
    }
    return m;
  };
}

function queryMap(ctor) {
  return function (Imm, entries) {
    const m = Imm[ctor](entries);
    return Imm.Map({
      size: m.size,
      isEmpty: m.isEmpty(),
      keys: m.keySeq().toSet().toArray().sort(),
      hasNull: m.has(null),
      get0: m.get(0, 'd'),
      reduceVals: m.reduce((a, v) => a + num(v), 0),
      toListVals: m.toList().toArray(),
      entryCount: m.entrySeq().size,
      flipKeys: m.flip().keySeq().toSet().size,
      find: m.findKey(v => typeof v === 'number' && v > 0),
    });
  };
}

module.exports = function register(checkParity) {
  const entriesArb = fc.array(fc.tuple(key, scalar), { maxLength: 20 });
  for (const ctor of ['Map', 'OrderedMap']) {
    checkParity(`${ctor} / op-log`, fc.array(mapOp(ctor), { maxLength: 40 }), applyMap(ctor));
    checkParity(`${ctor} / queries`, entriesArb, queryMap(ctor));
  }
};
