/** @import * as Immutable from '../type-definitions/immutable'*/
/** @import { ListImpl } from "../List"; */

/**
 * @template T
 * @typedef  {ReturnType<typeof Immutable.List<T>>} ImmutableList<T>
 */

export const IS_LIST_SYMBOL = '@@__IMMUTABLE_LIST__@@';

/**
 *
 * @param {unknown} maybeList
 * @returns {maybeList is ImmutableList<?>}
 */
export function isList(maybeList) {
  return Boolean(maybeList && maybeList[IS_LIST_SYMBOL]);
}
