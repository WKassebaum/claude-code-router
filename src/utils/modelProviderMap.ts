/**
 * Maps model aliases to their actual API model names
 * Used to resolve short/friendly names to full API model identifiers
 */
export const MODEL_ALIAS_MAP: Record<string, string> = {
  // Gemini 3.1 Pro aliases -> gemini-3.1-pro-preview (Feb 19, 2026)
  'gemini3.1': 'gemini-3.1-pro-preview',
  'gemini-3.1': 'gemini-3.1-pro-preview',
  'gemini3.1-pro': 'gemini-3.1-pro-preview',
  'gemini-3.1-pro': 'gemini-3.1-pro-preview',

  // Gemini 3 Pro aliases -> gemini-3-pro-preview
  'gemini3': 'gemini-3-pro-preview',
  'gemini-3': 'gemini-3-pro-preview',
  'gemini3-pro': 'gemini-3-pro-preview',
  'gemini-3-pro': 'gemini-3-pro-preview',

  // Gemini 3 Flash aliases -> gemini-3-flash-preview (Dec 17, 2025)
  'gemini3-flash': 'gemini-3-flash-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
  'flash3': 'gemini-3-flash-preview',
  'flash-3': 'gemini-3-flash-preview',

  // Claude Opus 4.6 aliases -> claude-opus-4-6
  'opus-4.6': 'claude-opus-4-6',
  'opus4.6': 'claude-opus-4-6',
  'claude-opus-4.6': 'claude-opus-4-6',
  'opus-4-6': 'claude-opus-4-6',

  // Claude Sonnet 4.6 aliases -> claude-sonnet-4-6
  'sonnet-4.6': 'claude-sonnet-4-6',
  'sonnet4.6': 'claude-sonnet-4-6',
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'sonnet-4-6': 'claude-sonnet-4-6',

  // Claude Opus 4.5 aliases -> claude-opus-4-5-20251101
  'opus-4.5': 'claude-opus-4-5-20251101',
  'opus4.5': 'claude-opus-4-5-20251101',
  'claude-opus-4.5': 'claude-opus-4-5-20251101',
  'opus-4-5': 'claude-opus-4-5-20251101',

  // GPT-5.4 aliases
  'gpt54': 'gpt-5.4',
  'gpt5.4': 'gpt-5.4',
  'gpt54-pro': 'gpt-5.4-pro',
  'gpt5.4-pro': 'gpt-5.4-pro',
  'gpt54pro': 'gpt-5.4-pro',

  // GPT-5.3 aliases
  'gpt53': 'gpt-5.3-codex',
  'gpt5.3': 'gpt-5.3-codex',
  'gpt53-codex': 'gpt-5.3-codex',
  'gpt5.3-codex': 'gpt-5.3-codex',

  // GPT-5.2 aliases
  'gpt52': 'gpt-5.2',
  'gpt5.2': 'gpt-5.2',
  'gpt52-pro': 'gpt-5.2-pro',
  'gpt5.2-pro': 'gpt-5.2-pro',
  'gpt52pro': 'gpt-5.2-pro',

  // GPT-5.1 aliases
  'gpt51': 'gpt-5.1',
  'gpt5.1': 'gpt-5.1',
  'gpt51-codex': 'gpt-5.1-codex',
  'gpt5.1-codex': 'gpt-5.1-codex',
};

/**
 * Maps common model names to their providers
 * Used when Claude Code sends model names without provider prefix
 */
export const MODEL_PROVIDER_MAP: Record<string, string> = {
  // XAI / Grok models
  // Grok 4.1 Fast (Nov 19, 2025 - 2M context)
  'grok-4-1-fast-reasoning': 'xai',
  'grok-4-1-fast-non-reasoning': 'xai',

  // Grok 4
  'grok-4-fast': 'xai',
  'grok-4-fast-reasoning': 'xai',
  'grok-4-fast-non-reasoning': 'xai',
  'grok-4': 'xai',
  'grok-4-code': 'xai',
  'grok-4-code-fast': 'xai',
  'grok-beta': 'xai',
  'grok-vision-beta': 'xai',

  // Google Gemini models
  // Gemini 3.1 Pro (Feb 19, 2026 - 77.1% ARC-AGI-2, 1M context, agentic coding)
  'gemini-3.1-pro-preview': 'gemini',
  'gemini-3.1-pro': 'gemini',
  'gemini3.1-pro': 'gemini',
  'gemini-3.1': 'gemini',
  'gemini3.1': 'gemini',

  // Gemini 3 Pro (Nov 2025 - 1501 Elo, highest on LMArena)
  'gemini-3-pro-preview': 'gemini',
  'gemini-3-pro': 'gemini',
  'gemini3-pro': 'gemini',
  'gemini-3': 'gemini',
  'gemini3': 'gemini',

  // Gemini 3 Pro Image (multimodal image generation)
  'gemini-3-pro-image-preview': 'gemini',

  // Gemini 3 Flash (Dec 17, 2025 - 78% SWE-bench, 1M context, fastest)
  'gemini-3-flash-preview': 'gemini',
  'gemini-3-flash': 'gemini',
  'gemini3-flash': 'gemini',
  'flash3': 'gemini',
  'flash-3': 'gemini',

  // Gemini 2.5
  'gemini-2.5-pro': 'gemini',
  'gemini-2.5-flash': 'gemini',

  // Gemini 2.0
  'gemini-2.0-pro': 'gemini',
  'gemini-2.0-flash': 'gemini',

  // Legacy versions
  'gemini-pro': 'gemini',
  'gemini-flash': 'gemini',
  'gemini-1.5-pro': 'gemini',
  'gemini-1.5-flash': 'gemini',

  // Anthropic models
  // Claude Opus 4.6 (Feb 5, 2026 - 1M context, agent teams, best for coding)
  'claude-opus-4-6': 'anthropic',
  'claude-opus-4.6': 'anthropic',
  'opus-4.6': 'anthropic',
  'opus4.6': 'anthropic',
  'opus-4-6': 'anthropic',

  // Claude Sonnet 4.6 (Feb 2026)
  'claude-sonnet-4-6': 'anthropic',
  'claude-sonnet-4.6': 'anthropic',
  'sonnet-4.6': 'anthropic',
  'sonnet4.6': 'anthropic',
  'sonnet-4-6': 'anthropic',

  // Claude Opus 4.5 (Nov 24, 2025)
  'claude-opus-4-5-20251101': 'anthropic',
  'claude-opus-4.5': 'anthropic',
  'opus-4.5': 'anthropic',
  'opus4.5': 'anthropic',
  'opus-4-5': 'anthropic',

  // Legacy Anthropic models (subscription)
  'claude-opus-4': 'anthropic-subscription',
  'claude-sonnet-4.5': 'anthropic-subscription',
  'claude-sonnet-4': 'anthropic-subscription',
  'claude-3.5-sonnet': 'anthropic-subscription',
  'claude-3.5-haiku': 'anthropic-subscription',
  'claude-3-opus': 'anthropic-subscription',
  'claude-3-sonnet': 'anthropic-subscription',
  'claude-3-haiku': 'anthropic-subscription',

  // OpenAI models
  // GPT-5.4 (Mar 5, 2026 - 1M context, native computer use, best coding+reasoning)
  'gpt-5.4': 'openai',
  'gpt-5.4-pro': 'openai',
  'gpt-5.4-pro-2026-03-05': 'openai',

  // GPT-5.3-Codex (Feb 5, 2026 - self-improving coding agent)
  'gpt-5.3-codex': 'openai',

  // GPT-5.2 (Dec 11, 2025 - best for coding and agentic tasks)
  'gpt-5.2': 'openai',
  'gpt-5.2-pro': 'openai',

  // GPT-5.1
  'gpt-5.1': 'openai',
  'gpt-5.1-codex': 'openai',
  'gpt-5.1-codex-max': 'openai',

  // GPT-5
  'gpt-5': 'openai',
  'gpt-5-mini': 'openai',
  'gpt-5-nano': 'openai',
  'gpt-5-pro': 'openai',

  // GPT-4.1
  'gpt-4.1': 'openai',
  'gpt-4.1-mini': 'openai',
  'gpt-4.1-nano': 'openai',
  'gpt-4.1-2025-04-14': 'openai',

  // GPT-4o
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-4': 'openai',
  'gpt-3.5-turbo': 'openai',

  // o-series reasoning models
  'o3': 'openai',
  'o3-mini': 'openai',
  'o3-pro': 'openai',
  'o4-mini': 'openai',
  'o1': 'openai',
  'o1-mini': 'openai',
  'o1-preview': 'openai',

  // DeepSeek models
  'deepseek-chat': 'deepseek',
  'deepseek-coder': 'deepseek',
  'deepseek-reasoner': 'deepseek',
};

/**
 * Resolve model alias to actual API model name
 * @param modelName - Model name or alias (e.g., "gemini3", "gemini-3-pro")
 * @returns Resolved model name (e.g., "gemini-3-pro-preview") or original if no alias found
 */
export function resolveModelAlias(modelName: string): string {
  // Check if this is an alias
  const resolvedModel = MODEL_ALIAS_MAP[modelName];
  if (resolvedModel) {
    return resolvedModel;
  }
  // Return original if not an alias
  return modelName;
}

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
