import type { Collection } from '../../type-definitions/immutable';

export const IS_KEYED_SYMBOL = '@@__IMMUTABLE_KEYED__@@';

export function isKeyed(
  maybeKeyed: unknown
): maybeKeyed is Collection.Keyed<unknown, unknown> {
  return Boolean(
    maybeKeyed && (maybeKeyed as { [key: string]: unknown })[IS_KEYED_SYMBOL]
  );
}
