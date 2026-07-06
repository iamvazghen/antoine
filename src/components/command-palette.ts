/**
 * Fuzzy command palette (Ctrl+P). Combines slash commands, recent sessions,
 * recent tickers, and provider names into one searchable overlay.
 *
 * Built atop pi-tui's `fuzzyFilter` + an `Input` for the query + a
 * `SelectList` for the filtered results.
 */
import { Container, Input, SelectList, Text, type SelectItem, type TUI, fuzzyMatch, Key, matchesKey } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';
import { SLASH_COMMANDS } from '../commands/index.js';

export type PaletteAction =
  | { kind: 'slash'; command: string }
  | { kind: 'session'; id: string }
  | { kind: 'provider'; id: string }
  | { kind: 'model'; providerId: string; modelId: string }
  | { kind: 'ticker'; symbol: string };

export interface PaletteItem {
  id: string;
  label: string;
  action: PaletteAction;
}

const MAX_VISIBLE_ROWS = 8;

export class CommandPaletteComponent extends Container {
  onSelect?: (action: PaletteAction) => void;
  onCancel?: () => void;

  private readonly input = new Input();
  private list: SelectList;
  private allItems: PaletteItem[] = [];
  private items: SelectItem[] = [];

  constructor(_tui: TUI, items: PaletteItem[]) {
    super();
    this.allItems = items;
    this.items = items.map((i) => ({ value: i.id, label: i.label, description: '' }));
    this.list = this.makeList(this.items);

    this.addChild(new Text(theme.primary('  ⌘  Command Palette  ·  type to filter'), 0, 0));
    this.addChild(this.input);
    this.addChild(this.list);
  }

  private makeList(items: SelectItem[]): SelectList {
    const list = new SelectList(items, MAX_VISIBLE_ROWS, {
      selectedPrefix: (text) => theme.primaryLight(text),
      selectedText: (text) => theme.bold(theme.primaryLight(text)),
      description: (text) => theme.muted(text),
      scrollInfo: (text) => theme.muted(text),
      noMatch: (text) => theme.muted(text),
    });
    list.onSelect = (item) => {
      const found = this.allItems.find((i) => i.id === item.value);
      if (found) this.onSelect?.(found.action);
    };
    list.onCancel = () => this.onCancel?.();
    return list;
  }

  private refilter() {
    const query = this.input.getValue();
    if (query === '') {
      this.items = this.allItems.map((i) => ({ value: i.id, label: i.label, description: '' }));
    } else {
      this.items = this.allItems
        .filter((i) => fuzzyMatch(query, i.label).matches)
        .map((i) => ({ value: i.id, label: i.label, description: '' }));
    }
    this.removeChild(this.list);
    this.list = this.makeList(this.items);
    this.addChild(this.list);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
      this.onCancel?.();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      // Enter selects the currently highlighted item from the SelectList.
      const item = this.list.getSelectedItem();
      const found = item ? this.allItems.find((i) => i.id === item.value) : undefined;
      if (found) this.onSelect?.(found.action);
      return;
    }
    // Up/Down/Tab navigate the result list.
    if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) {
      this.list.handleInput('[B');
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.list.handleInput('[A');
      return;
    }
    // Default: forward to the query input.
    this.input.handleInput(data);
    this.refilter();
  }
}

/**
 * Build a default palette item set from runtime context: slash commands,
 * recent sessions, providers, models, and tickers.
 */
export function buildDefaultPaletteItems(opts: {
  sessions: Array<{ id: string; title: string }>;
  providers: Array<{ id: string; displayName: string }>;
  modelsByProvider: Record<string, Array<{ id: string; displayName: string }>>;
  recentTickers: string[];
}): PaletteItem[] {
  const items: PaletteItem[] = [];

  for (const cmd of SLASH_COMMANDS) {
    items.push({
      id: `slash:${cmd.name}`,
      label: `/${cmd.name} — ${cmd.description}`,
      action: { kind: 'slash', command: cmd.name },
    });
  }

  for (const s of opts.sessions) {
    items.push({
      id: `session:${s.id}`,
      label: `↻ ${s.title}`,
      action: { kind: 'session', id: s.id },
    });
  }

  for (const p of opts.providers) {
    items.push({
      id: `provider:${p.id}`,
      label: `provider · ${p.displayName}`,
      action: { kind: 'provider', id: p.id },
    });
  }

  for (const [providerId, models] of Object.entries(opts.modelsByProvider)) {
    for (const m of models) {
      items.push({
        id: `model:${providerId}:${m.id}`,
        label: `model · ${providerId}/${m.displayName}`,
        action: { kind: 'model', providerId, modelId: m.id },
      });
    }
  }

  for (const t of opts.recentTickers) {
    items.push({
      id: `ticker:${t}`,
      label: `ticker · ${t}`,
      action: { kind: 'ticker', symbol: t },
    });
  }

  return items;
}