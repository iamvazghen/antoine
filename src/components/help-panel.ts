/**
 * The /help panel, generated from the command registry.
 *
 * It used to be a hand-written string that had already drifted from reality —
 * seven commands existed that it never mentioned. Generating it means the two
 * cannot diverge again, and every new command documents itself.
 *
 * Laid out as aligned columns rather than prose: a reference is scanned, not
 * read, and alignment is what makes scanning work.
 */
import { Container, Spacer, Text } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';
import {
  CATEGORY_ORDER,
  KEY_BINDINGS,
  commandsByCategory,
  type SlashCommand,
} from '../commands/index.js';

/** Left column width. Wide enough for the longest command plus its usage hint. */
const NAME_COL = 22;

function nameCell(cmd: SlashCommand): string {
  return cmd.usage ?? `/${cmd.name}`;
}

export class HelpPanelComponent extends Container {
  constructor() {
    super();
    this.build();
  }

  /** Rebuild with current theme colors — called on theme change. */
  refresh() {
    this.build();
  }

  private build() {
    this.clear();

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.bold(theme.primary('Commands')), 0, 0));

    for (const category of CATEGORY_ORDER) {
      const commands = commandsByCategory(category);
      if (commands.length === 0) continue;

      this.addChild(new Spacer(1));
      this.addChild(new Text(`  ${theme.accent(category)}`, 0, 0));

      for (const cmd of commands) {
        const name = nameCell(cmd).padEnd(NAME_COL);
        this.addChild(
          new Text(`    ${theme.primaryLight(name)}${theme.muted(cmd.description)}`, 0, 0),
        );
      }
    }

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.bold(theme.primary('Keys')), 0, 0));
    this.addChild(new Spacer(1));
    for (const binding of KEY_BINDINGS) {
      const keys = binding.keys.padEnd(NAME_COL);
      this.addChild(
        new Text(`    ${theme.primaryLight(keys)}${theme.muted(binding.description)}`, 0, 0),
      );
    }

    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        `  ${theme.muted('Tip: start with')} ${theme.primaryLight('antoine --resume')} ${theme.muted('to continue your last session.')}`,
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));
  }
}
