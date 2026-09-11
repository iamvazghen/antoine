import { describe, test, expect } from 'bun:test';
import { AnswerBoxComponent } from './answer-box.js';
import { CostCapOverlayComponent } from './cost-cap-overlay.js';
import { DebugPanelComponent } from './debug-panel.js';
import { DiffViewComponent } from './diff-view.js';
import { HelpPanelComponent } from './help-panel.js';
import { HintBarComponent } from './hint-bar.js';
import { IntroComponent } from './intro.js';
import { SourceChipsComponent } from './source-chips.js';
import { StatusBarComponent } from './status-bar.js';
import { ThinkingBlockComponent } from './thinking-block.js';
import { UserQueryComponent } from './user-query.js';
import { WatchlistComponent } from './watchlist.js';

/**
 * "Responsive" has to mean something checkable, so here it means: at any
 * terminal width from a wide desktop down to a phone-sized SSH window, no
 * component emits a line wider than the window it was handed.
 *
 * An over-wide line is not clipped by the terminal, it is wrapped — which
 * pushes every following line down and tears the layout apart. That is the
 * failure this catches, and it only appears at widths nobody resizes to by hand.
 */
const WIDTHS = [200, 120, 100, 80, 60, 48, 40, 32, 24, 20];

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** Longest visible line, ignoring colour codes. */
function widest(lines: string[]): { width: number; line: string } {
  let width = 0;
  let line = '';
  for (const raw of lines) {
    const visible = raw.replace(ANSI, '');
    if (visible.length > width) {
      width = visible.length;
      line = visible;
    }
  }
  return { width, line };
}

interface Renderable {
  render(width: number): string[];
}

const components: Array<[string, () => Renderable]> = [
  ['intro', () => new IntroComponent('minimax:MiniMax-M2.5', 'MiniMax', 15)],
  ['help panel', () => new HelpPanelComponent()],
  [
    'status bar',
    () => {
      const s = new StatusBarComponent();
      s.setProvider('MiniMax · MiniMax-M2.5');
      s.setStats({
        inputTokens: 128_400,
        outputTokens: 4_210,
        costUsd: 0.4213,
        iter: 3,
        maxIter: 12,
        tokensPerSecond: 41.7,
      });
      return s;
    },
  ],
  [
    'watchlist',
    () => {
      const w = new WatchlistComponent();
      w.setTickers(['AAPL', 'NVDA', 'BRK.B']);
      w.setQuote('AAPL', 319.97, [305, 311, 318, 322, 319]);
      w.setQuote('NVDA', 1284.5, [1180, 1220, 1260, 1301, 1284]);
      return w;
    },
  ],
  ['hint bar', () => new HintBarComponent()],
  [
    'user query',
    () =>
      new UserQueryComponent(
        'Compare 2024 annual revenue for AAPL, MSFT, GOOGL and AMZN side by side, then tell me which has the most durable margin profile over twenty years.',
      ),
  ],
  [
    'answer box',
    () =>
      new AnswerBoxComponent(
        '## Verdict\n\nNVDA scores **71** long term and **64** short term.\n\n| Factor | Score | Weight |\n|---|---|---|\n| ROIC durability | 88 | 16 |\n| Margin durability | 74 | 12 |\n\nThe balance sheet carries no net debt, which is what keeps survivability high.',
      ),
  ],
  [
    'thinking block',
    () =>
      new ThinkingBlockComponent(
        'The user is asking for a two-horizon grade, so I should call grade_ticker rather than assembling one by hand: the weights live there, and a hand-rolled number would not match the ledger.',
        'MiniMax-M2.5',
      ),
  ],
  [
    'source chips',
    () =>
      new SourceChipsComponent([
        {
          id: 1,
          url: 'https://finnhub.io/api/v1/stock/metric?symbol=AAPL',
          provider: 'Finnhub',
          title: 'AAPL metrics',
        },
        {
          id: 2,
          url: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL',
          provider: 'Yahoo Finance',
          title: 'AAPL monthly closes',
        },
      ]),
  ],
  [
    'diff view',
    () =>
      new DiffViewComponent(
        'const timeout = undefined;\nconst retries = 3;\n',
        'const timeout = DEFAULT_LLM_TIMEOUT_MS;\nconst retries = 3;\n',
      ),
  ],
  ['cost cap overlay', () => new CostCapOverlayComponent(4.82, 5)],
  ['debug panel', () => new DebugPanelComponent(4, true)],
];

describe('responsive layout', () => {
  for (const [name, make] of components) {
    test(`${name} never overruns the terminal width`, () => {
      for (const width of WIDTHS) {
        const { width: actual, line } = widest(make().render(width));
        if (actual > width) {
          throw new Error(
            `${name} emitted a ${actual}-column line at width ${width}:\n  ${line.slice(0, 160)}`,
          );
        }
      }
    });
  }

  test('every component survives a resize in both directions', () => {
    // Shrink then re-widen: a component that measured itself once and cached the
    // result stays wrapped after the window grows back.
    for (const [name, make] of components) {
      const c = make();
      const wide = c.render(120);
      c.render(40);
      const wideAgain = c.render(120);
      expect(`${name}:${wideAgain.join('\n')}`).toBe(`${name}:${wide.join('\n')}`);
    }
  });

  test('an absurdly narrow terminal is survivable rather than a crash', () => {
    // Nobody works at width 4, but a resize storm can hand you a transient bad
    // value, and throwing there takes down the whole session.
    for (const [name, make] of components) {
      try {
        make().render(4);
      } catch (e) {
        throw new Error(`${name} threw at width 4: ${(e as Error).message}`);
      }
    }
  });
});
