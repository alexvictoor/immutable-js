/**
 * Converts a value to a string, adding quotes if a string was provided.
 */
export default function quoteString(value: unknown): string {
  try {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  } catch (_ignoreError) {
    return JSON.stringify(value);
  }
}
