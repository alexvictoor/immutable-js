import type { Map } from '../../type-definitions/immutable';

export const IS_MAP_SYMBOL = '@@__IMMUTABLE_MAP__@@';

export function isMap(maybeMap: unknown): maybeMap is Map<unknown, unknown> {
  return Boolean(
    maybeMap && (maybeMap as { [key: string]: unknown })[IS_MAP_SYMBOL]
  );
}
