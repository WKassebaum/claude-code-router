/**
 * Maps common model names to their providers
 * Used when Claude Code sends model names without provider prefix
 */
export const MODEL_PROVIDER_MAP: Record<string, string> = {
  // XAI / Grok models
  'grok-4-fast': 'xai',
  'grok-4-fast-reasoning': 'xai',
  'grok-4': 'xai',
  'grok-4-code': 'xai',
  'grok-4-code-fast': 'xai',
  'grok-beta': 'xai',
  'grok-vision-beta': 'xai',

  // Google Gemini models
  'gemini-2.5-pro': 'gemini',
  'gemini-2.5-flash': 'gemini',
  'gemini-2.0-pro': 'gemini',
  'gemini-2.0-flash': 'gemini',
  'gemini-pro': 'gemini',
  'gemini-flash': 'gemini',
  'gemini-1.5-pro': 'gemini',
  'gemini-1.5-flash': 'gemini',

  // Anthropic models (subscription)
  'claude-opus-4': 'anthropic-subscription',
  'claude-sonnet-4.5': 'anthropic-subscription',
  'claude-sonnet-4': 'anthropic-subscription',
  'claude-3.5-sonnet': 'anthropic-subscription',
  'claude-3.5-haiku': 'anthropic-subscription',
  'claude-3-opus': 'anthropic-subscription',
  'claude-3-sonnet': 'anthropic-subscription',
  'claude-3-haiku': 'anthropic-subscription',

  // OpenAI models
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-4': 'openai',
  'gpt-3.5-turbo': 'openai',
  'o1': 'openai',
  'o1-mini': 'openai',
  'o1-preview': 'openai',

  // DeepSeek models
  'deepseek-chat': 'deepseek',
  'deepseek-coder': 'deepseek',
  'deepseek-reasoner': 'deepseek',
};

/**
 * Resolve provider name from model name
 * Priority:
 * 1. Check hardcoded MODEL_PROVIDER_MAP (fast for common models)
 * 2. Search config.Providers (flexible for custom models)
 * 3. Return 'unknown' (graceful fallback)
 *
 * @param modelName - Model name without provider prefix (e.g., "grok-4-fast-reasoning")
 * @param config - CCR configuration object
 * @returns Provider name (e.g., "xai") or "unknown"
 */
export function resolveProvider(modelName: string, config: any): string {
  // 1. Check hardcoded map for common models (fast O(1) lookup)
  const mappedProvider = MODEL_PROVIDER_MAP[modelName];
  if (mappedProvider) {
    return mappedProvider;
  }

  // 2. Search config.Providers for custom models
  if (config.Providers && Array.isArray(config.Providers)) {
    for (const provider of config.Providers) {
      if (provider.models && Array.isArray(provider.models)) {
        // Case-insensitive comparison
        if (provider.models.some((m: string) => m.toLowerCase() === modelName.toLowerCase())) {
          return provider.name;
        }
      }
    }
  }

  // 3. Fallback to 'unknown'
  return 'unknown';
}
