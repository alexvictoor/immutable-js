import type { List } from '../../type-definitions/immutable';

export const IS_LIST_SYMBOL = '@@__IMMUTABLE_LIST__@@';

export function isList(maybeList: unknown): maybeList is List<unknown> {
  return Boolean(
    maybeList && (maybeList as { [key: string]: unknown })[IS_LIST_SYMBOL]
  );
}
