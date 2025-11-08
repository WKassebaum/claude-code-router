// LRU cache for session usage

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  model?: string;
  provider?: string;
  route?: string;
  timestamp?: string;
}

class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map<K, V>();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key) as V;
    // Move to end to mark as recently used
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key: K, value: V): void {
    if (this.cache.has(key)) {
      // If key exists, delete it to update its position
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // If cache is full, delete the least recently used item
      const leastRecentlyUsedKey = this.cache.keys().next().value;
      if (leastRecentlyUsedKey !== undefined) {
        this.cache.delete(leastRecentlyUsedKey);
      }
    }
    this.cache.set(key, value);
  }

  values(): V[] {
    return Array.from(this.cache.values());
  }
}

export const sessionUsageCache = new LRUCache<string, Usage>(100);

/**
 * Cache for session forced models
 * Key: sessionId, Value: "provider,model" or "BYPASS" for bypassing routing
 */
export const sessionForcedModelCache = new LRUCache<string, string>(100);

/**
 * Normalize usage data from different provider formats to Anthropic format
 */
export function normalizeUsage(usage: any): Usage {
  if (!usage) {
    return { input_tokens: 0, output_tokens: 0 };
  }

  // If already in Anthropic format
  if (usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
    return {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0
    };
  }

  // Convert from OpenAI/Gemini format
  if (usage.prompt_tokens !== undefined && usage.completion_tokens !== undefined) {
    return {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0
    };
  }

  // Fallback for unknown formats
  return { input_tokens: 0, output_tokens: 0 };
}
