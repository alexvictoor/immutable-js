import type { ValueObject } from '../internalTypes';

export function isValueObject(maybeValue: unknown): maybeValue is ValueObject {
  const v = maybeValue as
    | { equals?: unknown; hashCode?: unknown }
    | null
    | undefined;
  return Boolean(
    v && typeof v.equals === 'function' && typeof v.hashCode === 'function'
  );
}
