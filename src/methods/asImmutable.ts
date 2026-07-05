import type { OwnerID } from '../TrieUtils';

export function asImmutable<
  C extends { __ensureOwner(ownerID: OwnerID | undefined): C }
>(this: C): C {
  return this.__ensureOwner(undefined);
}
