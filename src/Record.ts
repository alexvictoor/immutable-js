import { toJS } from './toJS';
import { KeyedCollection } from './Collection';
import { keyedSeqFromValue } from './Seq';
import { List } from './List';
import { ITERATE_ENTRIES, ITERATOR_SYMBOL } from './Iterator';
import { isRecord, IS_RECORD_SYMBOL } from './predicates/isRecord';
import { DELETE, OwnerID } from './TrieUtils';
import { getIn } from './methods/getIn';
import { hasIn } from './methods/hasIn';
import { toObject } from './methods/toObject';
import { viewAs, writable } from './utils/reinterpret';
import { setIn } from './methods/setIn';
import { deleteIn } from './methods/deleteIn';
import { update } from './methods/update';
import { updateIn } from './methods/updateIn';
import { merge, mergeWith } from './methods/merge';
import type { Merger } from './functional/merge';
import { mergeDeep, mergeDeepWith } from './methods/mergeDeep';
import { mergeIn } from './methods/mergeIn';
import { mergeDeepIn } from './methods/mergeDeepIn';
import { withMutations } from './methods/withMutations';
import { asMutable } from './methods/asMutable';
import { asImmutable } from './methods/asImmutable';

import invariant from './utils/invariant';
import quoteString from './utils/quoteString';
import { isImmutable } from './predicates/isImmutable';
import type {
  IterateType,
  ImmutableIterator,
  IteratorStep,
  SideEffect,
} from './internalTypes';

// `console` is optional (may be absent in some runtimes); declared structurally
// so the source can compile without pulling the whole DOM lib in.
declare const console: { warn?: (...args: Array<unknown>) => void } | undefined;

function throwOnInvalidDefaultValues(defaultValues: unknown): void {
  if (isRecord(defaultValues)) {
    throw new Error(
      'Can not call `Record` with an immutable Record as default values. Use a plain javascript object instead.'
    );
  }

  if (isImmutable(defaultValues)) {
    throw new Error(
      'Can not call `Record` with an immutable Collection as default values. Use a plain javascript object instead.'
    );
  }

  if (defaultValues === null || typeof defaultValues !== 'object') {
    throw new Error(
      'Can not call `Record` with a non-object as default values. Use a plain javascript object instead.'
    );
  }
}

// The runtime shape of a Record instance (produced by a RecordType factory).
// Derived from the Record class itself so the two shapes can't drift apart;
// only `set` is re-declared, because the class's `set` returns `this`, which
// has no referent on a standalone structural type.
interface RecordInstance
  extends Pick<
    Record,
    | '_values'
    | '_keys'
    | '_indices'
    | '_defaultValues'
    | '_name'
    | '__ownerID'
    | 'get'
    | 'has'
  > {
  set(k: string, v?: unknown): RecordInstance;
}

// The internal seq view a Record materializes to (exposes internal iteration).
interface RecordSeq {
  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<string, unknown>>;
  __iterate(
    fn: SideEffect<string, unknown, unknown>,
    reverse?: boolean
  ): number;
  equals(other: unknown): boolean;
  hashCode(): number;
}

// A RecordType is both callable and newable, and holds the shared prototype.
interface RecordFactory {
  (values?: unknown): RecordInstance;
  new (values?: unknown): RecordInstance;
  prototype: RecordInstance & { [key: string]: unknown };
  displayName?: string;
}

export class Record {
  declare _values: List<unknown>;
  declare _keys: Array<string>;
  declare _indices: { [key: string]: number };
  declare _defaultValues: { [key: string]: unknown };
  declare _name?: string | undefined;
  declare __ownerID?: OwnerID | undefined;

  // Attached on the prototype below.
  declare getIn: (keyPath: Iterable<unknown>) => unknown;
  declare hasIn: (keyPath: Iterable<unknown>) => boolean;
  declare setIn: (keyPath: Iterable<unknown>, value: unknown) => this;
  declare deleteIn: (keyPath: Iterable<unknown>) => this;
  declare removeIn: (keyPath: Iterable<unknown>) => this;
  declare update: (...args: Array<unknown>) => unknown;
  declare updateIn: (
    keyPath: Iterable<unknown>,
    ...args: Array<unknown>
  ) => this;
  declare merge: (...iters: Array<unknown>) => this;
  declare mergeWith: (merger: Merger, ...iters: Array<unknown>) => this;
  declare mergeIn: (
    keyPath: Iterable<unknown>,
    ...iters: Array<unknown>
  ) => this;
  declare mergeDeep: (...iters: Array<unknown>) => this;
  declare mergeDeepWith: (merger: unknown, ...iters: Array<unknown>) => this;
  declare mergeDeepIn: (
    keyPath: Iterable<unknown>,
    ...iters: Array<unknown>
  ) => this;
  declare withMutations: (mutator: (mutable: this) => unknown) => this;
  declare asMutable: () => this;
  declare asImmutable: () => this;
  declare toObject: () => { [key: string]: unknown };
  declare toJSON: () => { [key: string]: unknown };

  declare static isRecord: typeof isRecord;
  declare static getDescriptiveName: typeof recordName;

  constructor(defaultValues: unknown, name?: string) {
    let hasInitialized: boolean | undefined;

    throwOnInvalidDefaultValues(defaultValues);
    const defaults = defaultValues as { [key: string]: unknown };

    const RecordType = function Record(
      this: RecordInstance,
      values?: unknown
    ): RecordInstance {
      if (values instanceof RecordType) {
        return values;
      }
      if (!(this instanceof RecordType)) {
        // eslint-disable-next-line no-constructor-return
        return new RecordType(values);
      }
      if (!hasInitialized) {
        hasInitialized = true;
        const keys = Object.keys(defaults);
        const indices = (RecordTypePrototype._indices = {} as {
          [key: string]: number;
        });
        // Deprecated: left to attempt not to break any external code which
        // relies on a ._name property existing on record instances.
        // Use Record.getDescriptiveName() instead
        RecordTypePrototype._name = name;
        RecordTypePrototype._keys = keys;
        RecordTypePrototype._defaultValues = defaults;
        for (let i = 0; i < keys.length; i++) {
          const propName = keys[i]!;
          indices[propName] = i;
          if (RecordTypePrototype[propName]) {
            /* eslint-disable no-console */
            typeof console === 'object' &&
              console.warn &&
              console.warn(
                'Cannot define ' +
                  recordName(this) +
                  ' with property "' +
                  propName +
                  '" since that property name is part of the Record API.'
              );
            /* eslint-enable no-console */
          } else {
            setProp(RecordTypePrototype, propName);
          }
        }
      }
      this.__ownerID = undefined;
      this._values = new List().withMutations(l => {
        l.setSize(this._keys.length);
        new KeyedCollection<string, unknown>(values).forEach((v, k) => {
          l.set(
            this._indices[k]!,
            v === this._defaultValues[k] ? undefined : v
          );
        });
      });
      return this;
    } as RecordFactory;

    const RecordTypePrototype = (RecordType.prototype = Object.create(
      RecordPrototype
    ) as RecordFactory['prototype']);
    RecordTypePrototype.constructor = RecordType;

    if (name) {
      RecordType.displayName = name;
    }

    // A Record definition IS a factory function, not a plain instance.
    // eslint-disable-next-line no-constructor-return
    return viewAs<Record>(RecordType);
  }

  toString(): string {
    let str = recordName(this) + ' { ';
    const keys = this._keys;
    let k;
    for (let i = 0, l = keys.length; i !== l; i++) {
      k = keys[i]!;
      str += (i ? ', ' : '') + k + ': ' + quoteString(this.get(k));
    }
    return str + ' }';
  }

  equals(other: unknown): boolean {
    return (
      this === other ||
      (isRecord(other) &&
        recordSeq(this).equals(recordSeq(viewAs<RecordInstance>(other))))
    );
  }

  hashCode(): number {
    return recordSeq(this).hashCode();
  }

  // @pragma Access

  has(k: string): boolean {
    // Deliberately called on `_indices` itself (not Object.prototype): a
    // Record type defining a field literally named `hasOwnProperty` shadows
    // the built-in on the prototype and must keep throwing here, as 5.0.x
    // (and the published 5.1.x) do.
    // eslint-disable-next-line no-prototype-builtins
    return this._indices.hasOwnProperty(k);
  }

  get(k: string, notSetValue?: unknown): unknown {
    if (!this.has(k)) {
      return notSetValue;
    }
    const index = this._indices[k]!;
    const value = this._values.get(index);
    return value === undefined ? this._defaultValues[k] : value;
  }

  // @pragma Modification

  set(k: string, v?: unknown): this {
    if (this.has(k)) {
      const newValues = this._values.set(
        this._indices[k]!,
        v === this._defaultValues[k] ? undefined : v
      );
      if (newValues !== this._values && !this.__ownerID) {
        return makeRecord(this, newValues) as this;
      }
    }
    return this;
  }

  remove(k: string): this {
    return this.set(k);
  }

  clear(): this {
    const newValues = this._values.clear().setSize(this._keys.length);

    return this.__ownerID ? this : (makeRecord(this, newValues) as this);
  }

  wasAltered(): boolean {
    return this._values.wasAltered();
  }

  toSeq(): RecordSeq {
    return recordSeq(this);
  }

  toJS(): unknown {
    return toJS(this);
  }

  entries(): ImmutableIterator<IteratorStep<string, unknown>> {
    return this.__iterator(ITERATE_ENTRIES);
  }

  __iterator(
    type: IterateType,
    reverse?: boolean
  ): ImmutableIterator<IteratorStep<string, unknown>> {
    return recordSeq(this).__iterator(type, reverse);
  }

  __iterate(
    fn: SideEffect<string, unknown, unknown>,
    reverse?: boolean
  ): number {
    return recordSeq(this).__iterate(fn, reverse);
  }

  __ensureOwner(ownerID: OwnerID | undefined): this {
    if (ownerID === this.__ownerID) {
      return this;
    }
    const newValues = this._values.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this._values = newValues;
      return this;
    }
    return makeRecord(this, newValues, ownerID) as this;
  }
}

Record.isRecord = isRecord;
Record.getDescriptiveName = recordName;
const RecordPrototype = Record.prototype;
const writableProto = writable(RecordPrototype);
writableProto[IS_RECORD_SYMBOL] = true;
writableProto[DELETE] = RecordPrototype.remove;
writableProto['deleteIn'] = writableProto['removeIn'] = deleteIn;
writableProto['getIn'] = getIn;
// Same function CollectionImpl mixes onto Collection.prototype.
writableProto['hasIn'] = hasIn;
writableProto['merge'] = merge;
writableProto['mergeWith'] = mergeWith;
writableProto['mergeIn'] = mergeIn;
writableProto['mergeDeep'] = mergeDeep;
writableProto['mergeDeepWith'] = mergeDeepWith;
writableProto['mergeDeepIn'] = mergeDeepIn;
writableProto['setIn'] = setIn;
writableProto['update'] = update;
writableProto['updateIn'] = updateIn;
writableProto['withMutations'] = withMutations;
writableProto['asMutable'] = asMutable;
writableProto['asImmutable'] = asImmutable;
writableProto[ITERATOR_SYMBOL] = RecordPrototype.entries;
// Same function CollectionImpl mixes onto Collection.prototype.
writableProto['toJSON'] = writableProto['toObject'] = toObject;
writableProto['inspect'] = writableProto['toSource'] = function (
  this: Record
): string {
  return this.toString();
};

function makeRecord(
  likeRecord: RecordInstance,
  values: List<unknown>,
  ownerID?: OwnerID
): RecordInstance {
  const record: RecordInstance = Object.create(
    Object.getPrototypeOf(likeRecord)
  );
  record._values = values;
  record.__ownerID = ownerID;
  return record;
}

function recordName(record: {
  constructor: { displayName?: string; name?: string };
}): string {
  return record.constructor.displayName || record.constructor.name || 'Record';
}

function recordSeq(record: RecordInstance): RecordSeq {
  // The public seq type hides the internal iteration members present at runtime.
  return viewAs<RecordSeq>(
    keyedSeqFromValue(record._keys.map(k => [k, record.get(k)]))
  );
}

function setProp(prototype: RecordFactory['prototype'], name: string): void {
  try {
    Object.defineProperty(prototype, name, {
      get: function (this: RecordInstance) {
        return this.get(name);
      },
      set: function (this: RecordInstance, value: unknown) {
        invariant(this.__ownerID, 'Cannot set on an immutable record.');
        this.set(name, value);
      },
    });
  } catch (error) {
    // Object.defineProperty failed. Probably IE8.
  }
}
