import type { Collection } from '../../type-definitions/immutable';
import { isKeyed } from './isKeyed';
import { isIndexed } from './isIndexed';

export function isAssociative(
  maybeAssociative: unknown
): maybeAssociative is
  | Collection.Keyed<unknown, unknown>
  | Collection.Indexed<unknown> {
  return isKeyed(maybeAssociative) || isIndexed(maybeAssociative);
}
