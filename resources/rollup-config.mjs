import path from 'path';
import fs from 'fs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import copyright from './copyright.mjs';
import tsTranspile from './rollup-ts-transpile.mjs';

const SRC_DIR = path.resolve('src');
const DIST_DIR = path.resolve('dist');

// The entry file may be either JS or TS during the migration.
const ENTRY = ['Immutable.ts', 'Immutable.js']
  .map(f => path.join(SRC_DIR, f))
  .find(f => fs.existsSync(f));

// Resolve extensionless relative imports against both .ts and .js so a mixed
// (part-migrated) tree builds without touching every import statement.
const EXTENSIONS = ['.ts', '.js', '.mjs', '.json'];

export default [
  {
    input: ENTRY,
    plugins: [
      nodeResolve({ extensions: EXTENSIONS }),
      commonjs(),
      json(),
      tsTranspile(),
    ],
    output: [
      // umd build
      {
        banner: copyright,
        name: 'Immutable',
        exports: 'named',
        file: path.join(DIST_DIR, 'immutable.js'),
        format: 'umd',
        sourcemap: false,
      },
      // minified build for browsers
      {
        banner: copyright,
        name: 'Immutable',
        exports: 'named',
        file: path.join(DIST_DIR, 'immutable.min.js'),
        format: 'umd',
        sourcemap: false,
        plugins: [terser()],
      },
      // es build for bundlers and node
      {
        banner: copyright,
        name: 'Immutable',
        file: path.join(DIST_DIR, 'immutable.es.js'),
        format: 'es',
        sourcemap: false,
      },
    ],
  },
];
