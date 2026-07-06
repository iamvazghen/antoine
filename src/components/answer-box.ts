import { Container, Markdown, Spacer, Text } from '@mariozechner/pi-tui';
import { formatResponse } from '../utils/markdown-table.js';
import { markdownTheme, theme } from '../theme.js';
import { SourceChipsComponent } from './source-chips.js';

export class AnswerBoxComponent extends Container {
  private readonly body: Markdown;
  private value = '';

  constructor(initialText = '') {
    super();
    this.addChild(new Spacer(1));
    this.body = new Markdown('', 0, 0, markdownTheme, { color: (line) => line });
    this.addChild(this.body);
    this.setText(initialText);
  }

  setText(text: string) {
    this.value = text;
    const rendered = formatResponse(text);
    // Prevent "⏺" from appearing on its own line when model output starts with newlines.
    const normalized = rendered.replace(/^\n+/, '');
    this.body.setText(`${theme.primary('⏺ ')}${normalized}`);
  }

  appendSources(urls: ReadonlyArray<string>) {
    if (urls.length === 0) return;
    this.addChild(new SourceChipsComponent(urls));
  }
}
