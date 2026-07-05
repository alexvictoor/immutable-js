import type { Seq } from '../../type-definitions/immutable';

export const IS_SEQ_SYMBOL = '@@__IMMUTABLE_SEQ__@@';

export function isSeq(maybeSeq: unknown): maybeSeq is Seq<unknown, unknown> {
  return Boolean(
    maybeSeq && (maybeSeq as { [key: string]: unknown })[IS_SEQ_SYMBOL]
  );
}
