'use strict';
const { fc, scalar, key, jsValue } = require('../gen');

// ---- fromJS / toJS round trips ----
const toJS = (Imm, x) => (Imm.isCollection(x) || Imm.isRecord(x) ? x.toJS() : x);
function fromToJS(Imm, v) {
  const imm = Imm.fromJS(v);
  // Wrap in a List so scalars (fromJS(1) === 1) are still comparable.
  return Imm.List([imm, Imm.fromJS(toJS(Imm, imm))]);
}

// ---- Record ----
function recordCase(Imm, ops) {
  const R = Imm.Record({ a: 1, b: 'x', c: null });
  let r = R();
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    try {
      switch (op.t) {
        case 'setA': r = r.set('a', op.v); break;
        case 'setB': r = r.set('b', op.v); break;
        case 'remove': r = r.remove(op.f); break;
        case 'clear': r = r.clear(); break;
        case 'merge': r = r.merge({ a: op.v }); break;
        case 'update': r = r.update('a', x => (typeof x === 'number' ? x + 1 : x)); break;
      }
    } catch (e) {
      return Imm.Map({ __throw: i, name: String(e && e.name) });
    }
  }
  return Imm.Map({
    a: r.get('a'),
    b: r.get('b'),
    c: r.get('c'),
    obj: r.toObject(),
    seq: r.toSeq().toObject(),
    has: r.has('a'),
    size: r.size,
  });
}

const recordOp = fc.oneof(
  fc.record({ t: fc.constant('setA'), v: scalar }),
  fc.record({ t: fc.constant('setB'), v: scalar }),
  fc.record({ t: fc.constant('remove'), f: fc.constantFrom('a', 'b', 'c') }),
  fc.record({ t: fc.constant('clear') }),
  fc.record({ t: fc.constant('merge'), v: scalar }),
  fc.record({ t: fc.constant('update') })
);

// ---- functional API (operate on plain + immutable) ----
function functionalCase(Imm, c) {
  const { get, set, update, has, remove, getIn, setIn, updateIn, hasIn, removeIn, merge } = Imm;
  const base = c.useImm ? Imm.Map({ x: Imm.Map({ y: 1 }), z: 2 }) : { x: { y: 1 }, z: 2 };
  return Imm.List([
    Imm.fromJS(set(base, 'z', c.v)),
    Imm.fromJS(update(base, 'z', x => (typeof x === 'number' ? x + 1 : x))),
    Imm.fromJS(remove(base, 'z')),
    Imm.fromJS(setIn(base, ['x', 'y'], c.v)),
    Imm.fromJS(updateIn(base, ['x', 'y'], x => (typeof x === 'number' ? x * 10 : x))),
    Imm.fromJS(removeIn(base, ['x', 'y'])),
    Imm.fromJS(merge(base, { z: c.v })),
    Imm.Map({
      get: get(base, 'z', 'def'),
      has: has(base, 'z'),
      getIn: getIn(base, ['x', 'y'], 'def'),
      hasIn: hasIn(base, ['x', 'y']),
    }),
  ]);
}

// ---- is / hashCode parity ----
// Wrap in a List so scalar fromJS results still expose collection methods,
// and so hashCode() is defined regardless of the generated value.
function hashCase(Imm, c) {
  const a = Imm.List([Imm.fromJS(c)]);
  const b = Imm.List([Imm.fromJS(c)]);
  return Imm.Map({
    hashEqual: a.hashCode() === b.hashCode(),
    isEqual: Imm.is(a, b),
    selfHash: typeof a.hashCode() === 'number',
    equalsMethod: a.equals(b),
    // hashCode must be identical across libraries for equal structures:
    hash: a.hashCode(),
  });
}

// ---- cross-type conversions ----
function convertCase(Imm, entries) {
  const m = Imm.Map(entries);
  return Imm.Map({
    toList: m.toList().toArray(),
    toSet: m.toSet().toList().sort().toArray(),
    toOrderedMap: m.toOrderedMap().keySeq().toArray(),
    toStack: Imm.Stack(m.valueSeq()).toArray(),
    // Entries are [key, value] tuples; the keyed view maps index -> tuple, so
    // toObject() yields {'0': [k, v], ...} — a real probe of toKeyedSeq.
    toKeyed: JSON.stringify(Imm.List(entries).toKeyedSeq().toObject()),
  });
}

module.exports = function register(checkParity) {
  checkParity('fromJS/toJS', jsValue, fromToJS);
  checkParity('Record', fc.array(recordOp, { maxLength: 20 }), recordCase);
  checkParity('functional API', fc.record({ v: scalar, useImm: fc.boolean() }), functionalCase);
  checkParity('is/hashCode', jsValue, hashCase);
  checkParity('conversions', fc.array(fc.tuple(key, scalar), { maxLength: 14 }), convertCase);
};
