/** @import { KeyedCollectionImpl } from "../Collection"; */

export const IS_KEYED_SYMBOL = '@@__IMMUTABLE_KEYED__@@';

/**
 *
 * @param {unknown} maybeKeyed
 * @returns {maybeKeyed is KeyedCollectionImpl<?, ?>}
 */
export function isKeyed(maybeKeyed) {
  return Boolean(maybeKeyed && maybeKeyed[IS_KEYED_SYMBOL]);
}
