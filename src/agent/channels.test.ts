import { getChannelProfile } from './channels.js';

describe('channel profiles', () => {
  // The bug this guards: there was no telegram profile, so Telegram silently
  // got the CLI one — which instructs the agent to emit markdown tables
  // "rendered as formatted box tables". Telegram rendered them as walls of
  // pipes, because the CLI is the only channel that draws boxes.
  test('telegram resolves to its own profile, not the CLI fallback', () => {
    const telegram = getChannelProfile('telegram');
    expect(telegram.label).toBe('Telegram');
    expect(telegram.label).not.toBe(getChannelProfile('cli').label);
  });

  test('every delivery channel has a profile', () => {
    for (const channel of ['cli', 'whatsapp', 'telegram']) {
      expect(getChannelProfile(channel).label.toLowerCase()).toContain(
        channel === 'cli' ? 'cli' : channel,
      );
    }
  });

  test('telegram guidance covers the styling the renderer supports', () => {
    const format = getChannelProfile('telegram').responseFormat.join(' ').toLowerCase();
    for (const topic of ['bold', 'italic', 'table', 'emoji', 'link']) {
      expect(format).toContain(topic);
    }
  });

  test('whatsapp still forbids tables', () => {
    expect(getChannelProfile('whatsapp').tables).toBeNull();
  });

  test('an unknown channel falls back rather than throwing', () => {
    expect(getChannelProfile('carrier-pigeon').label).toBe('CLI');
    expect(getChannelProfile(undefined).label).toBe('CLI');
  });
});
