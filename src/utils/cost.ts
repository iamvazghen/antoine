/**
 * Rough USD cost estimator for LLM calls. Real billing varies by tier and
 * provider (Anthropic prompt caching, OpenAI tier discounts, Gemini free
 * tier, etc.) so this is approximate — the goal is "is this turn expensive"
 * not "exact cents". Sourced from public list prices at the model release
 * dates. Update when a model changes pricing.
 */

interface ModelPricing {
  /** Cost per 1K input tokens (USD). */
  inputPer1k: number;
  /** Cost per 1K output tokens (USD). */
  outputPer1k: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-8': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-sonnet-4-6': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-haiku-4-5': { inputPer1k: 0.0008, outputPer1k: 0.004 },
  'claude-fable-5': { inputPer1k: 0.003, outputPer1k: 0.015 },

  // OpenAI
  'gpt-5.5': { inputPer1k: 0.005, outputPer1k: 0.020 },
  'gpt-5.4': { inputPer1k: 0.0025, outputPer1k: 0.010 },
  'gpt-5.4-mini': { inputPer1k: 0.0002, outputPer1k: 0.0008 },

  // Google
  'gemini-3-flash-preview': { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  'gemini-3.1-pro-preview': { inputPer1k: 0.00125, outputPer1k: 0.005 },

  // xAI
  'grok-4-0709': { inputPer1k: 0.005, outputPer1k: 0.015 },
  'grok-4-1-fast-reasoning': { inputPer1k: 0.0002, outputPer1k: 0.0005 },

  // Moonshot
  'kimi-k2-5': { inputPer1k: 0.001, outputPer1k: 0.003 },

  // DeepSeek
  'deepseek-v4-pro': { inputPer1k: 0.0027, outputPer1k: 0.011 },
  'deepseek-v4-flash': { inputPer1k: 0.00014, outputPer1k: 0.00028 },

  // minimax (user-defined proxy). Ponytail default; user can edit.
  'MiniMax-M2.5': { inputPer1k: 0.002, outputPer1k: 0.008 },
  'MiniMax-M2.5-highspeed': { inputPer1k: 0.0008, outputPer1k: 0.0032 },
  'MiniMax-M3': { inputPer1k: 0.005, outputPer1k: 0.020 },

  // Fallback
  __default__: { inputPer1k: 0.002, outputPer1k: 0.008 },
};

/** Estimate cost in USD for a single LLM call given model name and token counts. */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Strip provider prefix when looking up pricing.
  const bare = model.replace(/^(minimax|openrouter|ollama|freellmapi):/, '');
  const pricing = PRICING[bare] ?? PRICING['__default__'];
  return (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k;
}

/** Format a USD amount compactly: $0.0012, $0.18, $1.42. */
export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}