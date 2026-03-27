/**
 * Safely parse JSON string with a fallback value.
 *
 * Unlike JSON.parse, this never throws. On invalid input,
 * the fallback value is returned instead.
 *
 * @param json - The JSON string to parse
 * @param fallback - Value to return if parsing fails
 * @returns Parsed value or fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
