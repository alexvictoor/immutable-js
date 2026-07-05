export default function isArrayLike(
  value: unknown
): value is ArrayLike<unknown> {
  if (Array.isArray(value) || typeof value === 'string') {
    return true;
  }

  return !!(
    value &&
    typeof value === 'object' &&
    'length' in value &&
    typeof value.length === 'number' &&
    Number.isInteger(value.length) &&
    value.length >= 0 &&
    (value.length === 0
      ? // Only {length: 0} is considered Array-like.
        Object.keys(value).length === 1
      : // An object is only Array-like if it has a property where the last value
        // in the array-like may be found (which could be undefined).
        // Deliberately called on the value itself (not Object.prototype): a
        // null-prototype object must keep throwing here, as 5.0.x did, rather
        // than silently coercing to an IndexedSeq and dropping named keys.
        // eslint-disable-next-line no-prototype-builtins
        value.hasOwnProperty(value.length - 1))
  );
}
