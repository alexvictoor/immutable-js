import { isOrdered } from '../predicates/isOrdered';
import isArrayLike from './isArrayLike';

export default function coerceKeyPath(keyPath: unknown): ArrayLike<unknown> {
  if (isArrayLike(keyPath) && typeof keyPath !== 'string') {
    return keyPath;
  }
  if (isOrdered(keyPath)) {
    return (keyPath as { toArray(): Array<unknown> }).toArray();
  }
  throw new TypeError(
    'Invalid keyPath: expected Ordered Collection or Array: ' + keyPath
  );
}
