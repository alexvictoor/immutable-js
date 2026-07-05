import { OwnerID } from '../TrieUtils';

export function asMutable<
  C extends {
    __ownerID?: OwnerID | undefined;
    __ensureOwner(ownerID: OwnerID | undefined): C;
  }
>(this: C): C {
  return this.__ownerID ? this : this.__ensureOwner(new OwnerID());
}
