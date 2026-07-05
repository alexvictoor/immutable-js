import { Seq, KeyedSeq, IndexedSeq, SetSeq } from './Seq';
import { CONSTRUCT } from './TrieUtils';
import { isCollection } from './predicates/isCollection';
import { isKeyed } from './predicates/isKeyed';
import { isIndexed } from './predicates/isIndexed';
import { isAssociative } from './predicates/isAssociative';
import type { Collection as ICollection } from '../type-definitions/immutable';
import type { Iterator } from './Iterator';
import type { InternalCollectionMethods } from './internalTypes';

// Each Collection class is a runtime constructor whose instance methods are
// contributed at load time by `mixin(...)` in CollectionImpl. The class is
// declaration-merged with its public interface (for the precise generic API)
// plus the internal `__`-machinery so both are visible to the type checker.
//
// The constructors use the "return override" pattern: called (via `new`) as a
// coercion factory they return an existing/converted collection. A subclass
// constructor forwards the private `CONSTRUCT` token to `super(...)` so the
// base skips coercion and merely constructs — this both satisfies the
// derived-class `super` requirement and avoids factory recursion.

// The base carries ONLY the internal machinery. The precise public API is
// contributed by each concrete subtype's own merged interface (extending the
// refined `Collection.Keyed`/`.Indexed`/`.Set`); keeping it off the base avoids
// the conflict between the base `Collection` API and its refinements.
export interface Collection<K, V> extends InternalCollectionMethods<K, V> {}
export class Collection<K, V> {
  declare static Iterator: typeof Iterator;
  declare static Keyed: typeof KeyedCollection;
  declare static Indexed: typeof IndexedCollection;
  declare static Set: typeof SetCollection;

  constructor(value?: unknown) {
    if (value === CONSTRUCT) return;
    // eslint-disable-next-line no-constructor-return
    return (isCollection(value) ? value : new Seq(value)) as Collection<K, V>;
  }
}

export interface KeyedCollection<K, V>
  extends ICollection.Keyed<K, V>,
    InternalCollectionMethods<K, V> {}
export class KeyedCollection<K, V> extends Collection<K, V> {
  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    // eslint-disable-next-line no-constructor-return
    return (isKeyed(value) ? value : new KeyedSeq(value)) as KeyedCollection<
      K,
      V
    >;
  }
}

export interface IndexedCollection<T>
  extends ICollection.Indexed<T>,
    InternalCollectionMethods<number, T> {}
export class IndexedCollection<T> extends Collection<number, T> {
  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    // eslint-disable-next-line no-constructor-return
    return (
      isIndexed(value) ? value : new IndexedSeq(value)
    ) as IndexedCollection<T>;
  }
}

export interface SetCollection<T>
  extends ICollection.Set<T>,
    InternalCollectionMethods<T, T> {}
export class SetCollection<T> extends Collection<T, T> {
  constructor(value?: unknown) {
    super(CONSTRUCT);
    if (value === CONSTRUCT) return;
    // eslint-disable-next-line no-constructor-return
    return (
      isCollection(value) && !isAssociative(value) ? value : new SetSeq(value)
    ) as SetCollection<T>;
  }
}

Collection.Keyed = KeyedCollection;
Collection.Indexed = IndexedCollection;
Collection.Set = SetCollection;
