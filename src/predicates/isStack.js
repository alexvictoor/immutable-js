/** @import { StackImpl } from "../Stack"; */

export const IS_STACK_SYMBOL = '@@__IMMUTABLE_STACK__@@';

/**
 *
 * @param {unknown} maybeStack
 * @returns {maybeStack is StackImpl<?>}
 */
export function isStack(maybeStack) {
  return Boolean(maybeStack && maybeStack[IS_STACK_SYMBOL]);
}
