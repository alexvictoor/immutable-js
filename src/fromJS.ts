import { Seq } from './Seq';
import { hasIterator } from './Iterator';
import { isImmutable } from './predicates/isImmutable';
import { isIndexed } from './predicates/isIndexed';
import { isKeyed } from './predicates/isKeyed';
import isArrayLike from './utils/isArrayLike';
import isPlainObj from './utils/isPlainObj';
import { viewCollectionAs } from './utils/reinterpret';
import type {
  Collection,
  FromJS,
  Seq as ISeq,
} from '../type-definitions/immutable';

type Converter = (
  key: unknown,
  value: unknown,
  path?: Array<unknown>
) => unknown;

// The public reviver shape, as declared in `type-definitions/immutable.d.ts`.
type Reviver = (
  key: string | number,
  sequence: Collection.Keyed<string, unknown> | Collection.Indexed<unknown>,
  path?: Array<string | number>
) => unknown;

// Overloads mirror the public API in `type-definitions/immutable.d.ts`,
// implemented over a loose implementation signature (the recursion threads
// erased values).
export function fromJS<JSValue>(
  jsValue: JSValue,
  reviver?: undefined
): FromJS<JSValue>;
export function fromJS(
  jsValue: unknown,
  reviver?: Reviver
): Collection<unknown, unknown>;
export function fromJS(
  value: unknown,
  converter?: Converter | Reviver
): unknown {
  return fromJSWith(
    [],
    // The recursion's loose view of the reviver: it is only ever invoked with
    // the (key, sequence, path) shapes the public Reviver type declares.
    (converter as Converter) || defaultConverter,
    value,
    '',
    converter && converter.length > 2 ? [] : undefined,
    { '': value }
  );
}

function fromJSWith(
  stack: Array<unknown>,
  converter: Converter,
  value: unknown,
  key: unknown,
  keyPath: Array<unknown> | undefined,
  parentValue: unknown
): unknown {
  if (
    typeof value !== 'string' &&
    !isImmutable(value) &&
    (isArrayLike(value) || hasIterator(value) || isPlainObj(value))
  ) {
    if (~stack.indexOf(value)) {
      throw new TypeError('Cannot convert circular structure to Immutable');
    }
    stack.push(value);
    keyPath && key !== '' && keyPath.push(key);
    const converted = converter.call(
      parentValue,
      key,
      // The base `Seq` type omits the refined `.map` (its return type differs
      // per Keyed/Indexed/Set subtype); the runtime value is a full Seq.
      viewCollectionAs<ISeq<unknown, unknown>>(new Seq(value)).map(
        (v: unknown, k: unknown) =>
          fromJSWith(stack, converter, v, k, keyPath, value)
      ),
      keyPath && keyPath.slice()
    );
    stack.pop();
    keyPath && keyPath.pop();
    return converted;
  }
  return value;
}

function defaultConverter(_k: unknown, v: unknown): unknown {
  // Effectively the opposite of "Collection.toSeq()"
  return isIndexed(v)
    ? v.toList()
    : isKeyed(v)
    ? v.toMap()
    : (v as { toSet(): unknown }).toSet();
}
