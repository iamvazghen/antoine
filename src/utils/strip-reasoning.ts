/**
 * Remove a model's inline reasoning from a user-facing answer.
 *
 * MiniMax M2.5 — the configured default — emits its chain of thought inline as
 * `<think>...</think>` in the message content rather than as a separate
 * reasoning field. Nothing stripped it, so a Telegram reply could open with
 * "The user wants me to report the MSFT grading results. Let me extract..."
 * before getting to the answer.
 *
 * Other providers use the same convention with different tags, so the whole
 * family is handled.
 */
const REASONING_TAGS = ['think', 'thinking', 'reasoning', 'reflection'];

const CLOSED_BLOCK = new RegExp(`<(${REASONING_TAGS.join('|')})>[\\s\\S]*?<\\/\\1>`, 'gi');
const UNCLOSED_BLOCK = new RegExp(`<(${REASONING_TAGS.join('|')})>[\\s\\S]*$`, 'i');

export function stripReasoning(text: string): string {
  if (!text) return text;

  let result = text.replace(CLOSED_BLOCK, '');

  // An unclosed opener means the model was cut off mid-thought. Everything from
  // there on is reasoning, never answer, so it goes — but only if some answer
  // survives, otherwise a truncated reply would come back completely empty and
  // the user would see nothing at all instead of a partial thought.
  if (UNCLOSED_BLOCK.test(result)) {
    const trimmed = result.replace(UNCLOSED_BLOCK, '');
    if (trimmed.trim().length > 0) result = trimmed;
  }

  // A stray closing tag with no opener (the opener was consumed upstream) means
  // everything before it was reasoning.
  const lastClose = result.lastIndexOf('</think>');
  if (lastClose !== -1) {
    const after = result.slice(lastClose + '</think>'.length);
    if (after.trim().length > 0) result = after;
  }

  return result.trim();
}
