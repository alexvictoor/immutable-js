import type { Collection } from '../../type-definitions/immutable';

export const IS_INDEXED_SYMBOL = '@@__IMMUTABLE_INDEXED__@@';

export function isIndexed(
  maybeIndexed: unknown
): maybeIndexed is Collection.Indexed<unknown> {
  return Boolean(
    maybeIndexed &&
      (maybeIndexed as { [key: string]: unknown })[IS_INDEXED_SYMBOL]
  );
}
