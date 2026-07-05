// Assertion function: narrows `condition` to truthy for the caller, so guarded
// values need no follow-up cast.
export default function invariant(
  condition: unknown,
  error: string
): asserts condition {
  if (!condition) throw new Error(error);
}
