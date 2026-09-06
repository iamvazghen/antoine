import { markdownToTelegramHtml, chunkHtml, stripHtml } from './format.js';

describe('markdownToTelegramHtml', () => {
  test('converts bold and italic', () => {
    expect(markdownToTelegramHtml('**MSFT** is *cheap*')).toBe('<b>MSFT</b> is <i>cheap</i>');
  });

  test('headers become bold, since Telegram has no headings', () => {
    expect(markdownToTelegramHtml('## Investment review')).toBe('<b>Investment review</b>');
  });

  test('escapes HTML so a price comparison cannot break the message', () => {
    expect(markdownToTelegramHtml('P/E < 20 & growing')).toBe('P/E &lt; 20 &amp; growing');
  });

  test('does not eat real numbers when restoring held content', () => {
    // The placeholder used to be a bare number in spaces, which collided with
    // figures like this and silently deleted them.
    const out = markdownToTelegramHtml('`AAPL` trades at P/E 27.7 vs 12 year median 31.3');
    expect(out).toContain('27.7');
    expect(out).toContain('12 year median 31.3');
    expect(out).toContain('<code>AAPL</code>');
  });

  test('renders a table as aligned monospace', () => {
    const md = ['| Horizon | Score |', '|---------|-------|', '| Short | 70 |', '| Long | 84 |'].join(
      '\n',
    );
    const out = markdownToTelegramHtml(md);
    expect(out.startsWith('<pre>')).toBe(true);
    expect(out).toContain('Horizon');
    expect(out).toContain('84');
    // The pipes are gone and the markdown separator row is not echoed as data.
    expect(out).not.toContain('|');
    expect(out).not.toContain('-------  ');
    // A single rule under the header is kept on purpose, for readability.
    expect(out.split('\n')[1]).toMatch(/^-+$/);
  });

  test('keeps code fences intact', () => {
    const out = markdownToTelegramHtml('```js\nconst a = 1 < 2;\n```');
    expect(out).toBe('<pre><code>const a = 1 &lt; 2;</code></pre>');
  });

  test('bullets become dots, not italics', () => {
    const out = markdownToTelegramHtml('* first\n* second');
    expect(out).toBe('• first\n• second');
  });

  test('links survive', () => {
    expect(markdownToTelegramHtml('[docs](https://example.com/a_b)')).toBe(
      '<a href="https://example.com/a_b">docs</a>',
    );
  });

  test('does not italicise underscores inside a symbol', () => {
    expect(markdownToTelegramHtml('use get_market_data now')).toBe('use get_market_data now');
  });

  test('strips horizontal rules', () => {
    expect(markdownToTelegramHtml('a\n\n---\n\nb')).toBe('a\n\nb');
  });

  test('empty input stays empty', () => {
    expect(markdownToTelegramHtml('')).toBe('');
  });
});

describe('chunkHtml', () => {
  test('leaves a short message alone', () => {
    expect(chunkHtml('<b>hi</b>')).toEqual(['<b>hi</b>']);
  });

  test('splits long text on line boundaries', () => {
    const line = 'x'.repeat(90);
    const chunks = chunkHtml(Array.from({ length: 40 }, () => line).join('\n'), 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
  });

  test('closes and reopens a <pre> block across a split', () => {
    const body = Array.from({ length: 30 }, (_, i) => `row ${i} ${'y'.repeat(40)}`).join('\n');
    const chunks = chunkHtml(`<pre>${body}</pre>`, 400);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk must be independently well-formed or Telegram rejects it.
    for (const c of chunks) {
      expect((c.match(/<pre>/g) ?? []).length).toBe((c.match(/<\/pre>/g) ?? []).length);
    }
  });
});

describe('stripHtml', () => {
  test('recovers readable plain text for the fallback send', () => {
    expect(stripHtml('<b>MSFT</b> P/E &lt; 30')).toBe('MSFT P/E < 30');
  });
});
