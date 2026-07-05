import arrCopy from './arrCopy';
import hasOwnProperty from './hasOwnProperty';

export default function shallowCopy<T>(from: Array<T>): Array<T>;
export default function shallowCopy<T extends object>(from: T): T;
export default function shallowCopy(from: object): object {
  if (Array.isArray(from)) {
    return arrCopy(from);
  }
  const to: Record<string, unknown> = {};
  const source = from as Record<string, unknown>;
  for (const key in source) {
    if (hasOwnProperty.call(source, key)) {
      to[key] = source[key];
    }
  }
  return to;
}
