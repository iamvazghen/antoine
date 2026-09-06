/**
 * A thinking model's reasoning, rendered so it can never be mistaken for the
 * answer.
 *
 * Three things make that distinction hold: a labelled header naming the model,
 * a dim left rule down every line, and muted italic body text. The answer, by
 * contrast, is full-brightness markdown with no rule. A user glancing at the
 * screen can tell which is which without reading a word.
 *
 * Long reasoning is clipped rather than allowed to bury the conversation — the
 * point is to show that the model reasoned and roughly how, not to reproduce a
 * transcript. The full text is always in the scratchpad.
 */
import { Container, Text } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';

/** Lines kept before clipping. Enough to see the shape of the reasoning. */
const MAX_LINES = 8;
/** Hard cap per line so a single long paragraph cannot flood the pane. */
const MAX_LINE_CHARS = 110;

export class ThinkingBlockComponent extends Container {
  constructor(content: string, model?: string) {
    super();
    this.build(content, model);
  }

  private build(content: string, model?: string) {
    this.clear();

    const raw = content.trim();
    if (!raw) return;

    const label = model ? `Thinking · ${model}` : 'Thinking';
    this.addChild(new Text(`${theme.muted('╭─ ')}${theme.muted(theme.bold(label))}`, 0, 0));

    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const shown = lines.slice(0, MAX_LINES);
    for (const line of shown) {
      const clipped =
        line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS - 1)}…` : line;
      this.addChild(new Text(`${theme.muted('│ ')}${theme.muted(theme.italic(clipped))}`, 0, 0));
    }

    const hidden = lines.length - shown.length;
    if (hidden > 0) {
      this.addChild(
        new Text(`${theme.muted('│ ')}${theme.muted(`… ${hidden} more line${hidden === 1 ? '' : 's'}`)}`, 0, 0),
      );
    }

    this.addChild(new Text(theme.muted('╰─'), 0, 0));
  }
}
