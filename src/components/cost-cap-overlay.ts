/**
 * One-time cost-cap warning overlay. Renders an inline prompt with three
 * choices: continue, switch model, end session. Uses a SelectList so the
 * existing keyboard handling works.
 */
import { Container, SelectList, Spacer, Text, type SelectItem } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';
import { formatUsd } from '../utils/cost.js';

export type CostCapDecision = 'continue' | 'switch-model' | 'end-session';

export class CostCapOverlayComponent extends Container {
  onSelect?: (decision: CostCapDecision) => void;
  onCancel?: () => void;

  constructor(private readonly currentCostUsd: number, private readonly capUsd: number) {
    super();

    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.warning(`⏺  Cost cap reached — ${formatUsd(currentCostUsd)} / ${formatUsd(capUsd)}`), 0, 0),
    );
    this.addChild(new Text(theme.muted('   Cumulative session cost has crossed your cap. What would you like to do?'), 0, 0));
    this.addChild(new Spacer(1));

    const items: SelectItem[] = [
      { value: 'continue', label: '1. Continue (disable cap for this session)' },
      { value: 'switch-model', label: '2. Switch to a cheaper model' },
      { value: 'end-session', label: '3. End session' },
    ];
    const list = new SelectList(items, 5, {
      selectedPrefix: (text) => theme.primaryLight(text),
      selectedText: (text) => theme.bold(theme.primaryLight(text)),
      description: (text) => theme.muted(text),
      scrollInfo: (text) => theme.muted(text),
      noMatch: (text) => theme.muted(text),
    });
    list.onSelect = (item) => this.onSelect?.(item.value as CostCapDecision);
    list.onCancel = () => this.onCancel?.();
    this.addChild(list);
  }
}