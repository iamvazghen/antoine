/**
 * +/- line-by-line diff for edit_file approvals. Wraps the `diff` package
 * already in dependencies. Renders inline (no overlay) — diffs are usually
 * short.
 */
import { Container, Text, Spacer } from '@mariozechner/pi-tui';
import { diffLines } from 'diff';
import { theme } from '../theme.js';

export class DiffViewComponent extends Container {
  constructor(oldText: string, newText: string) {
    super();
    const parts = diffLines(oldText, newText);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.muted('  diff:'), 0, 0));

    for (const part of parts) {
      const color = part.added ? theme.success : part.removed ? theme.error : theme.muted;
      const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
      const lines = part.value.split('\n');
      // Avoid trailing empty line from the split.
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      for (const line of lines) {
        this.addChild(new Text(color(`${prefix}${line || ' '}`), 0, 0));
      }
    }
  }
}