import { Seq } from './Seq';
import { isCollection } from './predicates/isCollection';
import { isKeyed } from './predicates/isKeyed';
import isDataStructure from './utils/isDataStructure';
import type { IterationMethods } from './internalTypes';

// Invoke-only view of the internal traversal (the value arrives via a cast).
type Iterable2 = Pick<IterationMethods<unknown, unknown>, '__iterate'>;

export function toJS(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  let coll: unknown = value;
  if (!isCollection(coll)) {
    if (!isDataStructure(coll)) {
      return coll;
    }
    coll = new Seq(coll);
  }
  const iterable = coll as Iterable2;
  if (isKeyed(coll)) {
    const result: Record<PropertyKey, unknown> = {};
    iterable.__iterate((v, k) => {
      // Keys are erased to `unknown` through Iterable2; at runtime they are
      // property keys (ObjectSeq yields symbols as well as strings).
      result[k as string | symbol] = toJS(v);
    });
    return result;
  }
  const result: Array<unknown> = [];
  iterable.__iterate(v => {
    result.push(toJS(v));
  });
  return result;
}
