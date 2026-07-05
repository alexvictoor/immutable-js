import type { Collection } from '../../type-definitions/immutable';

// Note: value is unchanged to not break immutable-devtools.
export const IS_COLLECTION_SYMBOL = '@@__IMMUTABLE_ITERABLE__@@';

export function isCollection(
  maybeCollection: unknown
): maybeCollection is Collection<unknown, unknown> {
  return Boolean(
    maybeCollection &&
      (maybeCollection as { [key: string]: unknown })[IS_COLLECTION_SYMBOL]
  );
}
