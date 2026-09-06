/**
 * Persistent status footer. Renders a single line summarizing the active
 * model, current-turn token usage + cost estimate, iteration count, and
 * tokens/second throughput. Updates whenever the underlying stats change.
 *
 * Wiring (in cli.ts):
 *   statusBar.setProvider(`OpenAI · gpt-5.5`);
 *   statusBar.setStats({ inputTokens, outputTokens, totalTokens, costUsd, iter, maxIter, tps });
 */
import { Container, Text, TruncatedText } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';
import { formatTokensCompact } from '../utils/format.js';
import { formatUsd } from '../utils/cost.js';
import { getModelCapabilities } from '../model/capabilities.js';

export interface StatusStats {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  iter: number;
  maxIter: number;
  tokensPerSecond: number | null;
}

export class StatusBarComponent extends Container {
  private readonly summaryText: Text;
  private providerLabel = '';
  private modelId = '';
  private stats: StatusStats | null = null;
  private lastRendered = '';

  constructor() {
    super();
    this.summaryText = new Text('', 0, 0);
    this.addChild(this.summaryText);
  }

  setProvider(label: string) {
    this.providerLabel = label;
    this.refresh();
  }

  /**
   * The model in use, so the bar can show whether it is a thinking model.
   * Knowing this up front matters: it tells the user whether to expect
   * reasoning blocks at all, rather than wondering why they never appear.
   */
  setModel(model: string) {
    this.modelId = model;
    this.refresh();
  }

  setStats(stats: StatusStats | null) {
    this.stats = stats;
    this.refresh();
  }

  private refresh() {
    if (!this.providerLabel && !this.stats && !this.modelId) {
      this.summaryText.setText('');
      this.lastRendered = '';
      return;
    }

    const parts: string[] = [];
    if (this.providerLabel) parts.push(theme.primary(this.providerLabel));

    if (this.modelId) {
      const caps = getModelCapabilities(this.modelId);
      // Dim for a plain model, accented for a thinking one - the badge is
      // meant to be readable at a glance, not to compete with the numbers.
      parts.push(caps.reasoning ? theme.accent(caps.label) : theme.muted(caps.label));
    }

    if (this.stats) {
      const { inputTokens, outputTokens, costUsd, iter, maxIter, tokensPerSecond } = this.stats;
      const tokenLine = `${theme.muted('↓')}${formatTokensCompact(inputTokens)} ${theme.muted('↑')}${formatTokensCompact(outputTokens)}`;
      parts.push(theme.muted(tokenLine));
      parts.push(theme.warning(formatUsd(costUsd)));
      parts.push(theme.muted(`iter ${iter}/${maxIter}`));
      if (tokensPerSecond != null) parts.push(theme.info(`${formatTokensCompact(tokensPerSecond)} t/s`));
    }

    this.lastRendered = parts.join(theme.muted(' · '));
    this.summaryText.setText(this.lastRendered);
  }
}

/**
 * Truncated helper used by status bar — re-exported so cli.ts can stay tidy.
 */
export const StatusLabel = TruncatedText;