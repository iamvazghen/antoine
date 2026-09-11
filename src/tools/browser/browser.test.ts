import { describe, expect, test } from 'bun:test';
import { browserLaunchBlockReason } from './browser.js';

describe('browserLaunchBlockReason', () => {
  test('blocks Bun on Windows, where the launch handshake never completes', () => {
    const reason = browserLaunchBlockReason({ isBun: true, platform: 'win32', force: false });
    expect(reason).toContain('Bun on Windows');
    expect(reason).toContain('web_fetch');
  });

  test('allows every other combination', () => {
    expect(browserLaunchBlockReason({ isBun: true, platform: 'linux', force: false })).toBeNull();
    expect(browserLaunchBlockReason({ isBun: false, platform: 'win32', force: false })).toBeNull();
    expect(browserLaunchBlockReason({ isBun: false, platform: 'linux', force: false })).toBeNull();
  });

  test('the force override wins', () => {
    expect(browserLaunchBlockReason({ isBun: true, platform: 'win32', force: true })).toBeNull();
  });
});
