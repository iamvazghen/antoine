import {
  SLASH_COMMANDS,
  CATEGORY_ORDER,
  KEY_BINDINGS,
  matchCommands,
  commandsByCategory,
} from './index.js';

describe('slash command registry', () => {
  test('every command has a category the help panel renders', () => {
    // A command in an unlisted category would be invisible in /help — the exact
    // way the old hand-written help text drifted.
    for (const cmd of SLASH_COMMANDS) {
      expect(CATEGORY_ORDER).toContain(cmd.category);
    }
  });

  test('every category is reachable from the registry', () => {
    const used = new Set(SLASH_COMMANDS.map((c) => c.category));
    for (const category of CATEGORY_ORDER) {
      expect(used.has(category)).toBe(true);
      expect(commandsByCategory(category).length).toBeGreaterThan(0);
    }
  });

  test('every command is documented and uniquely named', () => {
    const names = new Set<string>();
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.description.trim().length).toBeGreaterThan(10);
      expect(names.has(cmd.name)).toBe(false);
      names.add(cmd.name);
    }
  });

  test('usage strings start with the command they document', () => {
    for (const cmd of SLASH_COMMANDS) {
      if (cmd.usage) expect(cmd.usage.startsWith(`/${cmd.name}`)).toBe(true);
    }
  });

  test('the flagship features have first-class commands', () => {
    // Grading is the whole point of the tool; it should not be reachable only
    // by describing it in prose.
    const names = SLASH_COMMANDS.map((c) => c.name);
    expect(names).toContain('grade');
    expect(names).toContain('report');
    expect(names).toContain('thinking');
  });

  test('matchCommands filters by prefix and returns all on a bare slash', () => {
    expect(matchCommands('/').length).toBe(SLASH_COMMANDS.length);
    expect(matchCommands('/gra').map((c) => c.name)).toEqual(['grade']);
    expect(matchCommands('/zzz')).toEqual([]);
  });

  test('key bindings are described', () => {
    expect(KEY_BINDINGS.length).toBeGreaterThan(3);
    for (const b of KEY_BINDINGS) {
      expect(b.keys.trim().length).toBeGreaterThan(0);
      expect(b.description.trim().length).toBeGreaterThan(5);
    }
  });
});
