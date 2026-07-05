var typescript = require('typescript');
const path = require('path');
const makeSynchronous = require('make-synchronous');

const TYPESCRIPT_OPTIONS = {
  noEmitOnError: true,
  target: typescript.ScriptTarget.ES2015,
  module: typescript.ModuleKind.CommonJS,
  strictNullChecks: true,
  sourceMap: true,
  inlineSourceMap: true,
};

// Transpile a standalone (non-src) TypeScript file such as a test. ES2015 is
// fine here: these files consume the library, they do not define the immutable
// classes that must be callable without `new`.
function transpileTypeScript(src, path) {
  return typescript.transpile(src, TYPESCRIPT_OPTIONS, path, []);
}

const PLUGIN_PATH = path.resolve(__dirname, 'rollup-ts-transpile.mjs');

// Bundle a `src/` entry (JS or TS) with Rollup, mirroring the production build
// in resources/rollup-config.mjs. The ts-transpile plugin down-levels classes
// to ES5 so the public API can be invoked without `new`. Runs in a worker via
// make-synchronous, so everything must be required inside and args serializable.
function bundleSource(inputPath) {
  // Need to make this sync by calling `makeSynchronous`
  // while https://github.com/facebook/jest/issues/9504 is not resolved
  const fn = makeSynchronous(async (inputPath, pluginPath) => {
    const rollup = require('rollup');
    const { nodeResolve } = require('@rollup/plugin-node-resolve');
    const commonjs = require('@rollup/plugin-commonjs');
    const json = require('@rollup/plugin-json');
    const tsTranspile = (await import(pluginPath)).default;

    const inputOptions = {
      input: inputPath,
      onwarn: () => {},
      plugins: [
        nodeResolve({ extensions: ['.ts', '.js', '.mjs', '.json'] }),
        commonjs(),
        json(),
        tsTranspile(),
      ],
    };

    const bundle = await rollup.rollup(inputOptions);
    const { output } = await bundle.generate({
      file: inputPath,
      format: 'cjs',
      sourcemap: true,
    });
    await bundle.close();

    const { code, map } = output[0];
    if (!code) {
      throw new Error(
        'Unable to get code from rollup output in jestPreprocessor. Did rollup version change?'
      );
    }
    return { code, map };
  });

  return fn(inputPath, PLUGIN_PATH);
}

const SRC_DIR = path.resolve(__dirname, '..', 'src') + path.sep;

module.exports = {
  process(src, filePath) {
    if (filePath.endsWith('__tests__/MultiRequire.js')) {
      // exit early for multi-require as we explicitly want to have several instances
      return { code: src };
    }

    // Any file under src/ (JS or TS) is bundled through Rollup so classes are
    // down-leveled and the API stays callable without `new`.
    if (path.resolve(filePath).startsWith(SRC_DIR)) {
      return bundleSource(filePath);
    }

    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      return { code: transpileTypeScript(src, filePath) };
    }

    return bundleSource(filePath);
  },

  getCacheKey() {
    // ignore cache, as there is a conflict between rollup compile and jest preprocessor.
    return Date.now().toString();
  },
};
