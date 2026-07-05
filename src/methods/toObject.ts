import assertNotInfinite from '../utils/assertNotInfinite';

export function toObject<V>(this: {
  size: number | undefined;
  __iterate(
    fn: (value: V, key: unknown, iter: unknown) => unknown,
    reverse?: boolean
  ): number;
}): { [key: string]: V } {
  assertNotInfinite(this.size);
  const object: { [key: string]: V } = {};
  this.__iterate((v, k) => {
    object[k as string] = v;
  });
  return object;
}
