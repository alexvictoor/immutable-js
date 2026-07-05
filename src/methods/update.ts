import { update as _update } from '../functional/update';

export function update(
  this: object,
  key: unknown,
  notSetValue?: unknown,
  updater?: (value: unknown) => unknown
): unknown {
  // eslint-disable-next-line prefer-rest-params
  return arguments.length === 1
    ? (key as (collection: object) => unknown)(this)
    : _update(this, key, notSetValue, updater);
}
