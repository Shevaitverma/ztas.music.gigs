/**
 * Performance Utilities using Bun's native APIs
 * These are significantly faster than Node.js equivalents
 */

/**
 * Bun's native crypto is 2-3x faster than Node.js crypto
 */
export const generateRandomId = (): string => {
  // Bun's crypto.randomUUID() is optimized
  return crypto.randomUUID();
};

/**
 * Fast hash generation using Bun's native hashing
 * Much faster than Node.js crypto.createHash
 */
export const hashString = (str: string): string => {
  // Bun's native Bun.hash() is extremely fast
  return Bun.hash(str).toString(36);
};

/**
 * Efficient JSON parsing with Bun
 * Bun's JSON.parse is optimized at runtime level
 */
export const parseJSON = <T = any>(jsonString: string): T => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error}`);
  }
};

/**
 * Fast deep cloning using structuredClone (native in Bun)
 * Much faster than JSON.parse(JSON.stringify())
 */
export const deepClone = <T>(obj: T): T => {
  return structuredClone(obj);
};

/**
 * Efficient string encoding/decoding
 * Bun's TextEncoder/Decoder are optimized
 */
export const encodeString = (str: string): Uint8Array => {
  const encoder = new TextEncoder();
  return encoder.encode(str);
};

export const decodeString = (buffer: Uint8Array): string => {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
};

/**
 * Fast Base64 encoding using Bun's native btoa
 */
export const base64Encode = (str: string): string => {
  return btoa(str);
};

export const base64Decode = (str: string): string => {
  return atob(str);
};

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private start: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.start = Bun.nanoseconds();
  }

  end(): number {
    const elapsed = (Bun.nanoseconds() - this.start) / 1_000_000; // Convert to milliseconds
    console.log(`[Performance] ${this.label}: ${elapsed.toFixed(2)}ms`);
    return elapsed;
  }
}

/**
 * Batch operations helper for better performance
 */
export const batchProcess = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<R[]> => {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
};

/**
 * Memoization with Bun's fast Map
 */
export const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

/**
 * Debounce using Bun's Timer API
 */
export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: Timer | undefined;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
};

/**
 * Throttle using Bun's Timer API
 */
export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

