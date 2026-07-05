import type { OrderedSet } from '../../type-definitions/immutable';
import { isSet } from './isSet';
import { isOrdered } from './isOrdered';

export function isOrderedSet(
  maybeOrderedSet: unknown
): maybeOrderedSet is OrderedSet<unknown> {
  return isSet(maybeOrderedSet) && isOrdered(maybeOrderedSet);
}
