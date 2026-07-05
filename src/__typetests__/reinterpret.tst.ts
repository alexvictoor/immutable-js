/**
 * Type tests pinning the load-bearing constraints of the internal
 * reinterpretation seams (`utils/reinterpret`) and the branded sentinels.
 * These constraints are the migration's cast-safety story; before this suite
 * they were enforced only by the incidental compilation of existing call
 * sites, so a silent loosening would have gone unnoticed.
 */
import { expect, test } from 'tstyche';
import {
  callableAs,
  reparam,
  viewAs,
  viewCollectionAs,
  writable,
} from '../utils/reinterpret';
import { isNotSet } from '../TrieUtils';
import type { NotSet } from '../TrieUtils';

test('reparam re-types structure but can never invent it', () => {
  const source = { size: undefined as number | undefined };

  expect(reparam<{ size: number }>(source)).type.toBe<{ size: number }>();

  // A target introducing a member the source lacks is rejected.
  expect(reparam<{ size: number; extra: string }>(source)).type.toRaiseError();
});

test('viewCollectionAs requires the collection machinery on the source', () => {
  const machinery = {
    size: undefined as number | undefined,
    __iterate: (() => 0) as CallableFunction,
    __iterator: (() => 0) as CallableFunction,
  };

  expect(viewCollectionAs<{ other: true }>(machinery)).type.toBe<{
    other: true;
  }>();

  // An arbitrary object can never pass through this seam.
  expect(viewCollectionAs<{ other: true }>({})).type.toRaiseError();
});

test('callableAs ties parameters and pins object production', () => {
  const factory = (_value?: unknown): object => ({});

  expect(callableAs<(value?: unknown) => { x: number }>(factory)).type.toBe<
    (value?: unknown) => { x: number }
  >();

  // A primitive-returning signature can never be claimed.
  expect(callableAs<(value?: unknown) => number>(factory)).type.toRaiseError();

  // A non-function can never be reinterpreted as callable.
  expect(callableAs<(value?: unknown) => object>({})).type.toRaiseError();

  // The source must accept the parameters the claimed signature declares.
  const needsString = (_value: string): object => ({});
  expect(
    callableAs<(value?: unknown) => object>(needsString)
  ).type.toRaiseError();
});

test('viewAs requires object on both sides', () => {
  expect(viewAs<{ x: number }>({})).type.toBe<{ x: number }>();

  // Primitives can pass through neither position.
  expect(viewAs<{ x: number }>('string')).type.toRaiseError();
  expect(viewAs<number>({})).type.toRaiseError();
});

test('writable pins attached values to methods and brands', () => {
  const proto = writable({});

  expect((proto['method'] = () => 0)).type.toBe<() => number>();
  expect((proto['brand'] = true)).type.toBe<true>();

  // A data value can never be smuggled onto a prototype through this view.
  expect((proto['data'] = 42)).type.toRaiseError();
  expect((proto['data'] = 'str')).type.toRaiseError();
});

test('isNotSet narrows both branches of a sentinel union', () => {
  const value = {} as string | NotSet;

  if (isNotSet(value)) {
    expect(value).type.toBe<NotSet>();
  } else {
    expect(value).type.toBe<string>();
  }
});
