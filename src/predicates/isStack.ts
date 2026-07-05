import type { Stack } from '../../type-definitions/immutable';

export const IS_STACK_SYMBOL = '@@__IMMUTABLE_STACK__@@';

export function isStack(maybeStack: unknown): maybeStack is Stack<unknown> {
  return Boolean(
    maybeStack && (maybeStack as { [key: string]: unknown })[IS_STACK_SYMBOL]
  );
}
