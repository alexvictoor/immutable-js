import type { OwnerID } from '../TrieUtils';

export function withMutations<
  C extends {
    __ownerID?: OwnerID | undefined;
    asMutable(): C;
    wasAltered(): boolean;
    __ensureOwner(ownerID: OwnerID | undefined): C;
  }
>(this: C, fn: (mutable: C) => unknown): C {
  const mutable = this.asMutable();
  fn(mutable);
  return mutable.wasAltered() ? mutable.__ensureOwner(this.__ownerID) : this;
}
