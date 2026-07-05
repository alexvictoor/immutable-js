export function wasAltered<C extends { __altered?: boolean }>(
  this: C
): boolean {
  return !!this.__altered;
}
