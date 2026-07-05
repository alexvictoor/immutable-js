import type { Set as ImmutableSet } from '../../type-definitions/immutable';

export const IS_SET_SYMBOL = '@@__IMMUTABLE_SET__@@';

export function isSet(maybeSet: unknown): maybeSet is ImmutableSet<unknown> {
  return Boolean(
    maybeSet && (maybeSet as { [key: string]: unknown })[IS_SET_SYMBOL]
  );
}
