'use strict';
/**
 * Library-agnostic normalizer.
 *
 * Turns any Immutable.js value (from *either* the candidate build or the
 * reference oracle) into a canonical, plain-JS structure that can be compared
 * with a deep-equality check across two different copies of the library.
 *
 * `Immutable.is` cannot be used across libraries (it relies on brand checks and
 * shared symbols), so we walk each structure using the *owning* library's own
 * predicate functions and reduce it to tagged nested arrays.
 *
 * The tag records the concrete collection kind so that e.g. a Map and an
 * OrderedMap with the same entries do NOT compare equal — a migration that
 * silently changed a type would be caught.
 */

function makeNormalizer(Immutable) {
  const {
    isCollection,
    isKeyed,
    isIndexed,
    isRecord,
    isOrdered,
    isMap,
    isOrderedMap,
    isList,
    isStack,
    isSet,
    isOrderedSet,
    isSeq,
    isAssociative,
  } = Immutable;

  function kindTag(v) {
    if (isRecord(v)) return 'Record';
    if (isList(v)) return 'List';
    if (isStack(v)) return 'Stack';
    if (isOrderedMap(v)) return 'OrderedMap';
    if (isOrderedSet(v)) return 'OrderedSet';
    if (isMap(v)) return 'Map';
    if (isSet(v)) return 'Set';
    if (isSeq(v)) {
      if (isKeyed(v)) return 'Seq.Keyed';
      if (isIndexed(v)) return 'Seq.Indexed';
      return 'Seq.Set';
    }
    // Fallback by interface
    if (isKeyed(v)) return 'Keyed';
    if (isIndexed(v)) return 'Indexed';
    if (isAssociative(v)) return 'Associative';
    return 'Collection';
  }

  // Whether iteration order is a meaningful part of equality for this value.
  function isOrderSensitive(v) {
    if (isList(v) || isStack(v) || isOrderedMap(v) || isOrderedSet(v)) {
      return true;
    }
    if (isSeq(v) && isIndexed(v)) return true;
    if (isRecord(v)) return true;
    // plain Map / Set: order is deterministic within a version but we compare
    // order-insensitively so cross-version hash-ordering changes don't create
    // false positives. (Regression vs the frozen same-version baseline is still
    // caught because values must match.)
    return isOrdered(v);
  }

  function norm(v, seen) {
    if (v === null) return ['null'];
    if (v === undefined) return ['undefined'];
    const t = typeof v;
    if (t === 'number') {
      if (Number.isNaN(v)) return ['NaN'];
      if (v === 0) return ['number', 1 / v === -Infinity ? '-0' : '0'];
      return ['number', String(v)];
    }
    if (t === 'string') return ['string', v];
    if (t === 'boolean') return ['boolean', v];
    if (t === 'bigint') return ['bigint', v.toString()];
    if (t === 'function') return ['function'];
    if (t === 'symbol') return ['symbol', String(v)];

    if (isCollection(v) || isRecord(v)) {
      if (seen.has(v)) return ['circular'];
      seen.add(v);
      const tag = kindTag(v);
      let entries;
      if (isKeyed(v) || isRecord(v)) {
        entries = [];
        v.forEach((val, key) => {
          entries.push([norm(key, seen), norm(val, seen)]);
        });
      } else {
        entries = [];
        v.forEach(val => {
          entries.push(norm(val, seen));
        });
      }
      seen.delete(v);
      if (!isOrderSensitive(v)) {
        entries = entries
          .map(e => JSON.stringify(e))
          .sort()
          .map(s => JSON.parse(s));
      }
      return [tag, entries];
    }

    // Plain array
    if (Array.isArray(v)) {
      return ['Array', v.map(x => norm(x, seen))];
    }

    // Plain object
    if (t === 'object') {
      if (seen.has(v)) return ['circular'];
      seen.add(v);
      const keys = Object.keys(v).sort();
      const obj = keys.map(k => [k, norm(v[k], seen)]);
      seen.delete(v);
      return ['Object', obj];
    }

    return ['unknown', String(v)];
  }

  return function normalize(v) {
    return norm(v, new Set());
  };
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

module.exports = { makeNormalizer, deepEqual };
