'use strict';
/*
 * Self-bootstrapping reference builds for the golden-master tooling.
 *
 *   baseline — the frozen pre-migration JS build, compiled on demand from the
 *              pinned commit (the "5.0.3" commit immediately preceding the
 *              TypeScript migration) via a temporary git worktree that reuses
 *              this repo's node_modules.
 *   oracle   — the latest published `immutable` package, npm-installed on
 *              demand.
 *
 * Both are cached under golden-master/.cache (gitignored); delete that
 * directory to force a rebuild. Env overrides: GM_BASELINE, GM_ORACLE.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');

// The last pre-migration commit ("5.0.3"); the baseline is built from it.
const BASELINE_COMMIT = 'a0e0b161b8bc28c565d4a01e86378ee2f4f910fc';

const BASELINE_PATH = path.join(CACHE_DIR, 'immutable.baseline.js');
const ORACLE_PREFIX = path.join(CACHE_DIR, 'oracle-npm');
const ORACLE_PATH = path.join(ORACLE_PREFIX, 'node_modules', 'immutable');

function ensureBaseline() {
  if (process.env.GM_BASELINE) {
    return process.env.GM_BASELINE;
  }
  if (!fs.existsSync(BASELINE_PATH)) {
    console.log(
      'golden-master: building baseline from ' +
        BASELINE_COMMIT.slice(0, 9) +
        ' (one-time, cached in golden-master/.cache) ...'
    );
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const worktree = path.join(CACHE_DIR, 'baseline-src');
    execSync(`git worktree add --force "${worktree}" ${BASELINE_COMMIT}`, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    try {
      // Reuse this repo's node_modules; the pinned commit shares its dev deps.
      const link = path.join(worktree, 'node_modules');
      if (!fs.existsSync(link)) {
        fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), link, 'junction');
      }
      execSync('npx rollup -c ./resources/rollup-config.mjs', {
        cwd: worktree,
        stdio: 'inherit',
      });
      fs.copyFileSync(path.join(worktree, 'dist', 'immutable.js'), BASELINE_PATH);
    } finally {
      execSync(`git worktree remove --force "${worktree}"`, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
    }
  }
  return BASELINE_PATH;
}

function ensureOracle() {
  if (process.env.GM_ORACLE) {
    return process.env.GM_ORACLE;
  }
  if (!fs.existsSync(ORACLE_PATH)) {
    console.log(
      'golden-master: installing published immutable (oracle, one-time, cached) ...'
    );
    fs.mkdirSync(ORACLE_PREFIX, { recursive: true });
    execSync(
      `npm install immutable@latest --no-save --prefix "${ORACLE_PREFIX}"`,
      { stdio: 'inherit' }
    );
  }
  return ORACLE_PATH;
}

module.exports = { ensureBaseline, ensureOracle };
