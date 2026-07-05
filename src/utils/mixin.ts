import { writable } from './reinterpret';

/**
 * Contributes additional methods to a constructor.
 *
 * Both sides go through `writable` (see utils/reinterpret): the prototype
 * write path is the audited one, and the source view pins values to
 * `Attachable` (methods/brands) — a data value can't be smuggled through.
 */
export default function mixin<C extends { prototype: object }>(
  ctor: C,
  methods: object
): C {
  const proto = writable(ctor.prototype);
  const source = writable(methods);
  const keyCopier = (key: PropertyKey): void => {
    proto[key] = source[key];
  };
  Object.keys(methods).forEach(keyCopier);
  Object.getOwnPropertySymbols &&
    Object.getOwnPropertySymbols(methods).forEach(keyCopier);
  return ctor;
}
