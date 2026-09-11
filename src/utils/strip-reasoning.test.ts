import { describe, test, expect } from 'bun:test';
import { stripReasoning, extractReasoning } from './strip-reasoning.js';

describe('stripReasoning', () => {
  test('removes a closed think block', () => {
    expect(stripReasoning('<think>let me work this out</think>The answer is 42.')).toBe(
      'The answer is 42.',
    );
  });

  test('removes multiple blocks and keeps the text between them', () => {
    expect(stripReasoning('<think>a</think>First.<think>b</think>Second.')).toBe('First.Second.');
  });

  test('handles the other tag spellings', () => {
    expect(stripReasoning('<reasoning>x</reasoning>Answer')).toBe('Answer');
    expect(stripReasoning('<Thinking>x</Thinking>Answer')).toBe('Answer');
  });

  test('drops an unclosed trailing block', () => {
    expect(stripReasoning('Here is the grade.<think>now let me also consider')).toBe(
      'Here is the grade.',
    );
  });

  test('keeps a truncated thought rather than returning nothing', () => {
    // Better to show the user a partial thought than an empty message.
    expect(stripReasoning('<think>I was cut off mid')).toContain('cut off');
  });

  test('takes the text after a stray closing tag', () => {
    // The real MiniMax shape when the opener is consumed upstream.
    expect(stripReasoning('The user wants a grade. Let me check.\n</think>\n**MSFT** 84')).toBe(
      '**MSFT** 84',
    );
  });

  test('leaves an ordinary answer untouched', () => {
    const answer = 'MSFT scores 70 short and 84 long.';
    expect(stripReasoning(answer)).toBe(answer);
  });

  test('does not choke on empty input', () => {
    expect(stripReasoning('')).toBe('');
  });
});

describe('extractReasoning', () => {
  test('returns the reasoning as well as the answer', () => {
    const { answer, reasoning } = extractReasoning('<think>weighing the ROIC trend</think>MSFT: 84');
    expect(answer).toBe('MSFT: 84');
    expect(reasoning).toBe('weighing the ROIC trend');
  });

  test('joins multiple thinking blocks', () => {
    const { answer, reasoning } = extractReasoning('<think>a</think>First.<think>b</think>Second.');
    expect(answer).toBe('First.Second.');
    expect(reasoning).toBe('a\n\nb');
  });

  test('captures the stray-closing-tag shape MiniMax produces', () => {
    const { answer, reasoning } = extractReasoning(
      'The user wants a grade. Let me check.\n</think>\n**MSFT** 84',
    );
    expect(answer).toBe('**MSFT** 84');
    expect(reasoning).toContain('Let me check');
  });

  test('a non-thinking model yields no reasoning', () => {
    const { answer, reasoning } = extractReasoning('MSFT scores 84 long.');
    expect(answer).toBe('MSFT scores 84 long.');
    expect(reasoning).toBe('');
  });

  test('keeps a truncated thought as the answer rather than blanking the message', () => {
    const { answer } = extractReasoning('<think>I was cut off mid');
    expect(answer).toContain('cut off');
  });
});
