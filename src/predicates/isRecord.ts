import type { Record as ImmutableRecord } from '../../type-definitions/immutable';

export const IS_RECORD_SYMBOL = '@@__IMMUTABLE_RECORD__@@';

export function isRecord(
  maybeRecord: unknown
): maybeRecord is ImmutableRecord<object> {
  return Boolean(
    maybeRecord && (maybeRecord as { [key: string]: unknown })[IS_RECORD_SYMBOL]
  );
}
