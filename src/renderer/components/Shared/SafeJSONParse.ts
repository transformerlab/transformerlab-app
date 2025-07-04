/**
 * Safely parse JSON with error handling and type checking
 * @param data - The data to parse (string or already parsed object)
 * @param fallback - The fallback value to return if parsing fails
 * @returns The parsed object or the fallback value
 */
export function SafeJSONParse<T = any>(
  data: string | T,
  fallback: T = null as T,
): T {
  if (data === null || data === undefined) {
    return fallback;
  }

  // If it's already an object, return it as-is
  if (typeof data === 'object') {
    return data as T;
  }

  // If it's a string, try to parse it
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('SafeJSONParse: Failed to parse JSON:', error, data);
      return fallback;
    }
  }

  // For any other type, return the fallback
  return fallback;
}

export default SafeJSONParse;
