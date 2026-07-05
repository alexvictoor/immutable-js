import { getIn as _getIn } from '../functional/getIn';

export function getIn(
  this: object,
  searchKeyPath: Iterable<unknown>,
  notSetValue?: unknown
): unknown {
  return _getIn(this, searchKeyPath, notSetValue);
}
