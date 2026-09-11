import { describe, expect, test } from 'bun:test';
import { resolveRoute } from './resolve-route.js';

describe('resolveRoute', () => {
  test('falls back to default route', () => {
    const route = resolveRoute({
      cfg: {
        gateway: { accountId: 'default', logLevel: 'info' },
        channels: { telegram: { enabled: true, accounts: {}, allowFrom: [] } },
        bindings: [],
      },
      channel: 'telegram',
      accountId: 'default',
      peer: { kind: 'direct', id: '100200300' },
    });
    expect(route.agentId).toBe('default');
    expect(route.matchedBy).toBe('default');
    expect(route.sessionKey).toContain('telegram');
  });

  test('matches peer binding first', () => {
    const route = resolveRoute({
      cfg: {
        gateway: { accountId: 'default', logLevel: 'info' },
        channels: { telegram: { enabled: true, accounts: {}, allowFrom: [] } },
        bindings: [
          {
            agentId: 'alpha',
            match: {
              channel: 'telegram',
              peerKind: 'direct',
              peerId: '100200300',
            },
          },
        ],
      },
      channel: 'telegram',
      accountId: 'default',
      peer: { kind: 'direct', id: '100200300' },
    });
    expect(route.agentId).toBe('alpha');
    expect(route.matchedBy).toBe('binding.peer');
  });
});

