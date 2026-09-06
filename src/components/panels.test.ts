import { HelpPanelComponent } from './help-panel.js';
import { ThinkingBlockComponent } from './thinking-block.js';
import { IntroComponent } from './intro.js';
import { SLASH_COMMANDS } from '../commands/index.js';
import { setActiveTheme } from '../theme.js';

/** Flatten a component tree into the text it would print. */
function renderedText(component: { render: (width: number) => string[] }): string {
  return component.render(120).join('\n');
}

describe('help panel', () => {
  test('lists every registered command', () => {
    // The old hand-written help omitted seven commands. This makes that
    // impossible to repeat without a failing test.
    const text = renderedText(new HelpPanelComponent());
    for (const cmd of SLASH_COMMANDS) {
      expect(text).toContain(`/${cmd.name}`);
    }
  });

  test('shows category headings and key bindings', () => {
    const text = renderedText(new HelpPanelComponent());
    expect(text).toContain('Research');
    expect(text).toContain('Commands');
    expect(text).toContain('Keys');
    expect(text).toContain('ctrl+p');
  });
});

describe('thinking block', () => {
  test('renders the label, the model and the reasoning', () => {
    const text = renderedText(new ThinkingBlockComponent('Weighing ROIC.', 'minimax-m2.5'));
    expect(text).toContain('Thinking');
    expect(text).toContain('minimax-m2.5');
    expect(text).toContain('Weighing ROIC.');
  });

  test('renders nothing at all for empty reasoning', () => {
    // A non-thinking model must not produce an empty bordered box.
    expect(renderedText(new ThinkingBlockComponent('')).trim()).toBe('');
  });

  test('clips long reasoning instead of burying the conversation', () => {
    const long = Array.from({ length: 40 }, (_, i) => `thought ${i}`).join('\n');
    const text = renderedText(new ThinkingBlockComponent(long));
    expect(text).toContain('more line');
    expect(text.split('\n').length).toBeLessThan(15);
  });
});

describe('intro header', () => {
  test('names the model and flags a thinking model', () => {
    const text = renderedText(new IntroComponent('minimax:MiniMax-M2.5', 'MiniMax'));
    expect(text).toContain('thinking');
    expect(text).toContain('/help');
  });

  test('a non-reasoning model is shown as direct', () => {
    const text = renderedText(new IntroComponent('gpt-4o', 'OpenAI'));
    expect(text).toContain('direct');
  });

  test('survives a theme switch', () => {
    // Panels are colored at build time, so a theme change must rebuild them.
    for (const name of ['emerald', 'sapphire', 'amethyst', 'obsidian'] as const) {
      setActiveTheme(name);
      const intro = new IntroComponent('minimax:MiniMax-M2.5', 'MiniMax');
      intro.refresh();
      expect(renderedText(intro).length).toBeGreaterThan(0);
      const help = new HelpPanelComponent();
      help.refresh();
      expect(renderedText(help)).toContain('/grade');
    }
    setActiveTheme('emerald');
  });
});
