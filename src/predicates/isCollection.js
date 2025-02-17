/** @import { CollectionImpl } from "../Collection.js" */

// Note: value is unchanged to not break immutable-devtools.
export const IS_COLLECTION_SYMBOL = '@@__IMMUTABLE_ITERABLE__@@';

/**
 *
 * @param {unknown} maybeCollection
 * @returns {maybeCollection is CollectionImpl}
 */
export function isCollection(maybeCollection) {
  return Boolean(maybeCollection && maybeCollection[IS_COLLECTION_SYMBOL]);
}
