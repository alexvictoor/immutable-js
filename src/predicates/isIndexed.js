/** @import { IndexedCollectionImpl } from "../Collection"; */

export const IS_INDEXED_SYMBOL = '@@__IMMUTABLE_INDEXED__@@';

/**
 *
 * @param {unknown} maybeIndexed
 * @returns {maybeIndexed is IndexedCollectionImpl<?>}
 */
export function isIndexed(maybeIndexed) {
  return Boolean(maybeIndexed && maybeIndexed[IS_INDEXED_SYMBOL]);
}
