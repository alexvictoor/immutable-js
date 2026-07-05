import ts from 'typescript';

/**
 * Minimal transpile-only TypeScript plugin for Rollup.
 *
 * It strips types with `ts.transpileModule` (no type-checking, so a build never
 * fails on a type error) and leaves ES module syntax intact for Rollup to
 * bundle. Type-safety is enforced separately by `tsc --noEmit` via
 * `src/tsconfig.json`. This mirrors what `resources/jestPreprocessor.js` does
 * for the unit tests, keeping the two pipelines behaviorally aligned.
 */

// Per-module transpilation would inline a private copy of each emit helper
// into every module that needs it (11 `__extends` copies in the bundle).
// Instead helpers are suppressed (`noEmitHelpers`) and every module that
// needs one imports the single shared implementation — the text is exactly
// what `ts.transpileModule` emits, so runtime semantics are unchanged.
// HELPER_NAMES drives both the injection regex and the import list. A helper
// the emit needs but this module does not provide is caught at BUILD time by
// the unknown-helper scan in `transform` below — necessary because a helper
// referenced only inside a function body (e.g. `__assign` from an object
// spread) would otherwise be a latent ReferenceError that fires only when a
// test exercises that path.
const HELPERS_IMPORT_ID = 'immutable-ts-helpers';
const HELPERS_RESOLVED_ID = '\0' + HELPERS_IMPORT_ID;
const HELPER_NAMES = ['__extends', '__spreadArray'];
const HELPERS_SOURCE = `export var __extends = (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
export var __spreadArray = function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
`;

export default function tsTranspile() {
  return {
    name: 'ts-transpile',
    resolveId(source) {
      return source === HELPERS_IMPORT_ID ? HELPERS_RESOLVED_ID : null;
    },
    load(id) {
      return id === HELPERS_RESOLVED_ID ? HELPERS_SOURCE : null;
    },
    transform(code, id) {
      // Transpile both .ts and .js source files (down-leveling classes so the
      // API can be called without `new`). During the migration the tree is a
      // mix of both; handling each uniformly replaces the previous buble step.
      const isSource =
        !id.includes('/node_modules/') &&
        !id.endsWith('.d.ts') &&
        (id.endsWith('.ts') || id.endsWith('.js'));
      if (!isSource) return null;
      const { outputText, sourceMapText } = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          // ES5 target (like the previous buble step) transpiles `class` to
          // plain functions, which — unlike native ES2015 classes — can be
          // invoked without `new`. Immutable's public API relies on this
          // (e.g. `List(...)` called as a function). The source uses no
          // generators or for..of, so no iteration helpers are needed.
          target: ts.ScriptTarget.ES5,
          module: ts.ModuleKind.ESNext,
          // Helpers come from the shared module above instead of being
          // inlined per module; `importHelpers` stays off so nothing pulls
          // in tslib.
          noEmitHelpers: true,
          importHelpers: false,
          isolatedModules: true,
          sourceMap: true,
        },
      });
      // Any TS emit helper not in HELPER_NAMES has no implementation to
      // import — fail the build rather than ship a latent ReferenceError.
      // The pattern lists TS's emit-helper names explicitly (NOT a generic
      // `__*` match, which would trip on Immutable's own `__iterate` etc.).
      // It can also match helper names in comments; that produces a false
      // build failure, never a false pass.
      const TS_HELPER_PATTERN =
        /\b__(?:extends|assign|rest|decorate|param|metadata|awaiter|generator|exportStar|createBinding|values|read|spread|spreadArrays|spreadArray|await|asyncGenerator|asyncDelegator|asyncValues|makeTemplateObject|importStar|importDefault|classPrivateFieldGet|classPrivateFieldSet|classPrivateFieldIn|setFunctionName|propKey|esDecorate|runInitializers|addDisposableResource|disposeResources)\b/g;
      const unknownHelpers = [
        ...new Set(outputText.match(TS_HELPER_PATTERN) ?? []),
      ].filter(name => !HELPER_NAMES.includes(name));
      if (unknownHelpers.length) {
        this.error(
          `ts-transpile: emit for ${id} references helper(s) with no shared ` +
            `implementation: ${unknownHelpers.join(', ')}. Add them to ` +
            `HELPER_NAMES/HELPERS_SOURCE in resources/rollup-ts-transpile.mjs.`
        );
      }
      // Appended (not prepended) so the sourcemap's line numbers stay valid;
      // ES module imports are hoisted, so placement is irrelevant.
      const needed = HELPER_NAMES.filter(name =>
        new RegExp(`\\b${name}\\b`).test(outputText)
      );
      const finalCode = needed.length
        ? outputText +
          `\nimport { ${needed.join(', ')} } from '${HELPERS_IMPORT_ID}';\n`
        : outputText;
      return { code: finalCode, map: sourceMapText || null };
    },
  };
}
