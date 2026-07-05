import { hasIn as _hasIn } from '../functional/hasIn';

export function hasIn(this: object, searchKeyPath: Iterable<unknown>): boolean {
  return _hasIn(this, searchKeyPath);
}
