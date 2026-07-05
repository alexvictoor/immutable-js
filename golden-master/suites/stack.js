'use strict';
const { fc, scalar, index } = require('../gen');

const num = x => (typeof x === 'number' ? x : 0);

const stackOp = fc.oneof(
  fc.record({ t: fc.constant('push'), v: scalar }),
  fc.record({ t: fc.constant('pop') }),
  fc.record({ t: fc.constant('unshift'), v: scalar }),
  fc.record({ t: fc.constant('shift') }),
  fc.record({ t: fc.constant('pushAll'), arr: fc.array(scalar, { maxLength: 4 }) }),
  fc.record({ t: fc.constant('clear') }),
  fc.record({ t: fc.constant('map') }),
  fc.record({ t: fc.constant('filter') }),
  fc.record({ t: fc.constant('reverse') }),
  fc.record({ t: fc.constant('slice'), a: index, b: index })
);

function applyStack(Imm, ops) {
  let s = Imm.Stack();
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    try {
      switch (op.t) {
        case 'push': s = s.push(op.v); break;
        case 'pop': s = s.pop(); break;
        case 'unshift': s = s.unshift(op.v); break;
        case 'shift': s = s.shift(); break;
        case 'pushAll': s = s.pushAll(op.arr); break;
        case 'clear': s = s.clear(); break;
        case 'map': s = s.map(x => num(x) * 2); break;
        case 'filter': s = s.filter(x => typeof x !== 'number' || x % 2 === 0); break;
        case 'reverse': s = s.reverse(); break;
        case 'slice': s = s.slice(op.a, op.b); break;
      }
      if (s && typeof s.size === 'number') { void s.size; }
    } catch (e) {
      return Imm.Map({ __throw: i, name: String(e && e.name) });
    }
  }
  // Also capture peek()
  return Imm.List([s.toList(), Imm.Map({ peek: s.peek(), size: s.size })]);
}

module.exports = function register(checkParity) {
  checkParity('Stack / op-log', fc.array(stackOp, { maxLength: 40 }), applyStack);
};
