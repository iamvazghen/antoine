/**
 * Markdown -> Telegram HTML.
 *
 * Telegram's sendMessage renders nothing unless `parse_mode` is set, and this
 * bot sent every reply as plain text. So the agent's `**MSFT**` arrived as
 * literal asterisks and a markdown table arrived as a wall of pipes.
 *
 * HTML rather than MarkdownV2 on purpose: MarkdownV2 requires escaping
 * ``_*[]()~`>#+-=|{}.!`` everywhere, and a single missed character makes the
 * whole API call fail with a 400 — losing the message rather than mis-styling
 * it. HTML needs only `&`, `<` and `>` escaped and supports everything used
 * here.
 *
 * Telegram has no table markup, so tables become aligned monospace inside
 * <pre>, which is the only way to keep columns lined up on a phone.
 */

const TELEGRAM_LIMIT = 4000;

/** Placeholder delimiter for content held back from the inline rules. */
const SENTINEL = String.fromCharCode(0);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render a markdown table as fixed-width text so the columns still line up. */
function renderTable(rows: string[]): string {
  const cells = rows
    .map((row) =>
      row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    )
    // Drop the |---|---| separator row.
    .filter((cols) => !cols.every((c) => /^:?-{2,}:?$/.test(c)));

  if (cells.length === 0) return '';

  const columns = Math.max(...cells.map((c) => c.length));
  const widths: number[] = [];
  for (let i = 0; i < columns; i++) {
    widths[i] = Math.max(...cells.map((c) => (c[i] ?? '').length));
  }

  const lines = cells.map((cols) =>
    cols.map((c, i) => (i === cols.length - 1 ? c : c.padEnd(widths[i]))).join('  ').trimEnd(),
  );

  // A rule under the header keeps it readable once the pipes are gone.
  if (lines.length > 1) {
    lines.splice(1, 0, '-'.repeat(Math.min(Math.max(...lines.map((l) => l.length)), 40)));
  }

  return `<pre>${escapeHtml(lines.join('\n'))}</pre>`;
}

export function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return '';

  const held: string[] = [];
  // NUL-delimited, deliberately: a plain " 12 " style placeholder would be
  // clobbered by any real figure in the text ("P/E 27.7 vs 12y median"). NUL
  // never occurs in model output and passes through escapeHtml untouched.
  const hold = (html: string): string => {
    held.push(html);
    return `${SENTINEL}${held.length - 1}${SENTINEL}`;
  };

  let text = markdown.replace(/\r\n/g, '\n');

  // Fenced code blocks first — their contents must survive every other rule.
  text = text.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, (_m, code: string) =>
    hold(`<pre><code>${escapeHtml(String(code).replace(/\n$/, ''))}</code></pre>`),
  );

  // Tables, before the inline rules mangle the pipes.
  const lines = text.split('\n');
  const out: string[] = [];
  let table: string[] = [];
  const flush = (): void => {
    if (table.length > 0) {
      out.push(hold(renderTable(table)));
      table = [];
    }
  };
  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) table.push(line);
    else {
      flush();
      out.push(line);
    }
  }
  flush();
  text = out.join('\n');

  // Inline code, also protected from the emphasis rules.
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => hold(`<code>${escapeHtml(code)}</code>`));

  text = escapeHtml(text);

  // Links before emphasis so bracketed link text is not treated as markup.
  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  // Headers become bold — Telegram has no heading sizes.
  text = text.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, (_m, title: string) => `<b>${title}</b>`);

  text = text.replace(/\*\*\*([^\n*]+)\*\*\*/g, '<b><i>$1</i></b>');
  text = text.replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^\n_]+)__/g, '<b>$1</b>');
  text = text.replace(/~~([^\n~]+)~~/g, '<s>$1</s>');
  // Single-asterisk italics, but not a bullet ("* item") and not mid-word.
  text = text.replace(/(^|[\s(])\*(?!\s)([^\n*]+?)(?<!\s)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  text = text.replace(/(^|[\s(])_(?!\s)([^\n_]+?)(?<!\s)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');

  text = text.replace(/^\s*[-*+]\s+/gm, '• ');
  text = text.replace(/^\s*&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  // Horizontal rules have no Telegram equivalent and just add noise.
  text = text.replace(/^\s*([-*_])\1{2,}\s*$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  const restore = new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g');
  text = text.replace(restore, (_m, i: string) => held[Number(i)] ?? '');

  return text.trim();
}

/**
 * Split for Telegram's message limit without cutting a tag in half. Only <pre>
 * spans multiple lines here, so it is the only block that needs reopening.
 */
export function chunkHtml(html: string, limit = TELEGRAM_LIMIT): string[] {
  if (html.length <= limit) return [html];

  const chunks: string[] = [];
  let current = '';
  let inPre = false;

  const push = (): void => {
    if (!current.trim()) {
      current = '';
      return;
    }
    chunks.push(inPre ? `${current}</pre>` : current);
    current = inPre ? '<pre>' : '';
  };

  for (const line of html.split('\n')) {
    if (current.length + line.length + 1 > limit) push();
    current += (current && current !== '<pre>' ? '\n' : '') + line;
    const opens = (line.match(/<pre>/g) ?? []).length;
    const closes = (line.match(/<\/pre>/g) ?? []).length;
    if (opens > closes) inPre = true;
    else if (closes > opens) inPre = false;
  }

  if (current.trim()) chunks.push(inPre ? `${current}</pre>` : current);
  return chunks;
}

/** Last-resort plain text, for when Telegram rejects the HTML. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
