'use strict';
const { fc, scalar, index, smallInt } = require('../gen');

const num = x => (typeof x === 'number' ? x : 0);
const evenVal = x => typeof x !== 'number' || x % 2 === 0;

// Operation set for List. Each op is a plain record fast-check can generate.
const listOp = fc.oneof(
  fc.record({ t: fc.constant('push'), v: scalar }),
  fc.record({ t: fc.constant('pop') }),
  fc.record({ t: fc.constant('unshift'), v: scalar }),
  fc.record({ t: fc.constant('shift') }),
  fc.record({ t: fc.constant('set'), i: index, v: scalar }),
  fc.record({ t: fc.constant('delete'), i: index }),
  fc.record({ t: fc.constant('insert'), i: index, v: scalar }),
  fc.record({ t: fc.constant('remove'), i: index }),
  fc.record({ t: fc.constant('clear') }),
  fc.record({ t: fc.constant('setSize'), n: fc.integer({ min: 0, max: 14 }) }),
  fc.record({ t: fc.constant('slice'), a: index, b: index }),
  fc.record({ t: fc.constant('splice'), i: index, n: fc.integer({ min: 0, max: 4 }), vs: fc.array(scalar, { maxLength: 3 }) }),
  fc.record({ t: fc.constant('concat'), arr: fc.array(scalar, { maxLength: 4 }) }),
  fc.record({ t: fc.constant('map') }),
  fc.record({ t: fc.constant('flatMap') }),
  fc.record({ t: fc.constant('filter') }),
  fc.record({ t: fc.constant('filterNot') }),
  fc.record({ t: fc.constant('reverse') }),
  fc.record({ t: fc.constant('sort') }),
  fc.record({ t: fc.constant('sortBy') }),
  fc.record({ t: fc.constant('take'), n: index }),
  fc.record({ t: fc.constant('takeLast'), n: index }),
  fc.record({ t: fc.constant('skip'), n: index }),
  fc.record({ t: fc.constant('skipLast'), n: index }),
  fc.record({ t: fc.constant('takeWhile') }),
  fc.record({ t: fc.constant('skipWhile') }),
  fc.record({ t: fc.constant('flatten') }),
  fc.record({ t: fc.constant('interpose'), v: scalar }),
  fc.record({ t: fc.constant('zip'), arr: fc.array(smallInt, { maxLength: 4 }) }),
  fc.record({ t: fc.constant('rest') }),
  fc.record({ t: fc.constant('butLast') }),
  fc.record({ t: fc.constant('setIn'), i: index, v: scalar }),
  fc.record({ t: fc.constant('updateIn'), i: index }),
  fc.record({ t: fc.constant('update') })
);

function applyList(Imm, ops) {
  let l = Imm.List();
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    try {
      switch (op.t) {
        case 'push': l = l.push(op.v); break;
        case 'pop': l = l.pop(); break;
        case 'unshift': l = l.unshift(op.v); break;
        case 'shift': l = l.shift(); break;
        case 'set': l = l.set(op.i, op.v); break;
        case 'delete': l = l.delete(op.i); break;
        case 'insert': l = l.insert(op.i, op.v); break;
        case 'remove': l = l.remove(op.i); break;
        case 'clear': l = l.clear(); break;
        case 'setSize': l = l.setSize(op.n); break;
        case 'slice': l = l.slice(op.a, op.b); break;
        case 'splice': l = l.splice(op.i, op.n, ...op.vs); break;
        case 'concat': l = l.concat(op.arr); break;
        case 'map': l = l.map(x => num(x) * 2); break;
        case 'flatMap': l = l.flatMap(x => [x, num(x) + 1]); break;
        case 'filter': l = l.filter(evenVal); break;
        case 'filterNot': l = l.filterNot(evenVal); break;
        case 'reverse': l = l.reverse(); break;
        case 'sort': l = l.sort(); break;
        case 'sortBy': l = l.sortBy(x => -num(x)); break;
        case 'take': l = l.take(op.n); break;
        case 'takeLast': l = l.takeLast(op.n); break;
        case 'skip': l = l.skip(op.n); break;
        case 'skipLast': l = l.skipLast(op.n); break;
        case 'takeWhile': l = l.takeWhile(x => num(x) < 3); break;
        case 'skipWhile': l = l.skipWhile(x => num(x) < 3); break;
        case 'flatten': l = l.flatten(); break;
        case 'interpose': l = l.interpose(op.v); break;
        case 'zip': l = l.zip(Imm.List(op.arr)); break;
        case 'rest': l = l.rest(); break;
        case 'butLast': l = l.butLast(); break;
        case 'setIn': l = l.setIn([op.i], op.v); break;
        case 'updateIn': l = l.updateIn([op.i], 0, x => num(x) + 1); break;
        case 'update': l = l.update(x => x.push('u')); break;
      }
      // Force any laziness so exceptions surface deterministically.
      if (l && typeof l.size === 'number') { void l.size; }
    } catch (e) {
      return Imm.Map({ __throw: i, name: String(e && e.name) });
    }
  }
  return l;
}

// Read-only queries over a constructed list — checks scalar-returning methods.
function queryList(Imm, arr) {
  const l = Imm.List(arr);
  return Imm.Map({
    size: l.size,
    isEmpty: l.isEmpty(),
    first: l.first(),
    last: l.last(),
    get3: l.get(3),
    getNeg: l.get(-1),
    getDef: l.get(99, 'def'),
    includes2: l.includes(2),
    indexOf2: l.indexOf(2),
    lastIndexOf2: l.lastIndexOf(2),
    findIndex: l.findIndex(x => typeof x === 'number' && x > 1),
    count: l.count(),
    countBy: l.countBy(x => typeof x).toObject(),
    reduce: l.reduce((a, x) => a + (typeof x === 'number' ? x : 0), 0),
    reduceRight: l.reduceRight((a, x) => a + '|' + String(x), ''),
    join: l.join(','),
    max: l.max(),
    min: l.min(),
    keySeqArr: l.keySeq().toArray(),
    entryArr: l.entrySeq().toArray(),
    groupBy: l.groupBy(x => (typeof x === 'number' ? x % 2 : -1)).map(g => g.toArray()).toObject(),
    every: l.every(x => x !== null),
    some: l.some(x => x === null),
  });
}

module.exports = function register(checkParity) {
  checkParity('List / op-log', fc.array(listOp, { maxLength: 40 }), applyList);
  checkParity('List / queries', fc.array(scalar, { maxLength: 20 }), queryList);
};
