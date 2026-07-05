'use strict';
/* Shared fast-check arbitraries used across suites. */
const fc = require('fast-check');

// Primitive scalar values that both libraries treat identically.
const scalar = fc.oneof(
  fc.integer({ min: -8, max: 8 }),
  fc.constantFrom(0, -0, 1.5, -1.5, NaN, Infinity, -Infinity),
  fc.string({ maxLength: 4 }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined)
);

// Keys used for Map/Set: primitives only (object identity keys cannot be
// replayed meaningfully across two libraries).
const key = fc.oneof(
  fc.integer({ min: -4, max: 4 }),
  fc.string({ maxLength: 3 }),
  fc.boolean(),
  fc.constant(null)
);

const smallInt = fc.integer({ min: -6, max: 6 });
const index = fc.integer({ min: -4, max: 10 });

// A plain-JS nested value for fromJS / deep-merge testing.
const jsValue = fc.letrec(tie => ({
  leaf: scalar,
  node: fc.oneof(
    { weight: 3, arbitrary: tie('leaf') },
    {
      weight: 1,
      arbitrary: fc.array(tie('node'), { maxLength: 3 }),
    },
    {
      weight: 1,
      arbitrary: fc.dictionary(fc.string({ maxLength: 3 }), tie('node'), {
        maxKeys: 3,
      }),
    }
  ),
})).node;

module.exports = { fc, scalar, key, smallInt, index, jsValue };
