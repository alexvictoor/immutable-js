export const IS_ORDERED_SYMBOL = '@@__IMMUTABLE_ORDERED__@@';

export function isOrdered(maybeOrdered: unknown): boolean {
  return Boolean(
    maybeOrdered &&
      (maybeOrdered as { [key: string]: unknown })[IS_ORDERED_SYMBOL]
  );
}
