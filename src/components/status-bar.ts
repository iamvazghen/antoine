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

  setStats(stats: StatusStats | null) {
    this.stats = stats;
    this.refresh();
  }

  private refresh() {
    if (!this.providerLabel && !this.stats) {
      this.summaryText.setText('');
      this.lastRendered = '';
      return;
    }

    const parts: string[] = [];
    if (this.providerLabel) parts.push(theme.primary(this.providerLabel));

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