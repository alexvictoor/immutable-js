'use strict';
/*
 * Golden-master runner.
 *
 *   node golden-master/run.js
 *
 * Compares the candidate build (dist/immutable.js — rebuild first with
 * `npm run build:dist`) against the published `immutable` oracle installed in
 * the scratchpad temp folder. Exits non-zero if any suite finds a behavioral
 * divergence.
 */
const { checkParity, summary, Candidate, Oracle } = require('./harness');

console.log(
  `candidate=${Candidate.version || '(src build)'}  oracle=${Oracle.version}`
);
console.log('running golden-master parity suites...\n');

require('./suites/list')(checkParity);
require('./suites/map')(checkParity);
require('./suites/set')(checkParity);
require('./suites/stack')(checkParity);
require('./suites/seq')(checkParity);
require('./suites/misc')(checkParity);

const failed = summary();
process.exit(failed === 0 ? 0 : 1);
