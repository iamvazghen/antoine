import { Container, Spacer, Text } from '@mariozechner/pi-tui';
import packageJson from '../../package.json';
import { getModelCapabilities } from '../model/capabilities.js';
import { theme } from '../theme.js';

const BANNER = `
 █████╗ ███╗   ██╗████████╗ ██████╗ ██╗███╗   ██╗███████╗
██╔══██╗████╗  ██║╚══██╔══╝██╔═══██╗██║████╗  ██║██╔════╝
███████║██╔██╗ ██║   ██║   ██║   ██║██║██╔██╗ ██║█████╗
██╔══██║██║╚██╗██║   ██║   ██║   ██║██║██║╚██╗██║██╔══╝
██║  ██║██║ ╚████║   ██║   ╚██████╔╝██║██║ ╚████║███████╗
╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝`;

/** Label column width for the session facts block. */
const LABEL_COL = 9;

/**
 * Opening header: the banner, then the facts that change what the session will
 * do. Deliberately short — a splash screen that has to be scrolled past is a
 * splash screen nobody reads. Everything here is something the user would
 * otherwise have to run a command to discover.
 */
export class IntroComponent extends Container {
  private model: string;
  private providerCount = 0;

  constructor(model: string, _providerName?: string, providerCount = 0) {
    super();
    this.model = model;
    this.providerCount = providerCount;
    this.build();
  }

  setModel(model: string) {
    this.model = model;
    this.build();
  }

  /**
   * Re-render with the current theme colors. Called on theme change — the
   * strings are colored at build time, so they must be rebuilt rather than
   * cached once in the constructor to recolor live.
   */
  refresh() {
    this.build();
  }

  private row(label: string, value: string) {
    this.addChild(new Text(`  ${theme.muted(label.padEnd(LABEL_COL))}${value}`, 0, 0));
  }

  private build() {
    this.clear();

    this.addChild(new Spacer(1));
    // Indent to the same gutter as the text below; the banner used to start
    // hard against column 0 while every other line was inset by two.
    const banner = BANNER.split('\n')
      .map((line) => (line ? `  ${line}` : line))
      .join('\n');
    this.addChild(new Text(theme.bold(theme.primary(banner)), 0, 0));
    this.addChild(new Spacer(1));

    this.addChild(
      new Text(
        `  ${theme.bold('Financial research agent')} ${theme.muted(`v${packageJson.version}`)}`,
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    const caps = getModelCapabilities(this.model);
    // The model and its thinking badge live in the status bar, which is always
    // on screen. Repeating them here put the same two facts on three adjacent
    // lines at startup. What the status bar cannot say is what the badge MEANS,
    // so that is all this keeps.
    this.row(
      'mode',
      caps.reasoning
        ? `${theme.accent('thinking')} ${theme.muted('· its reasoning is shown, labelled, above each answer')}`
        : `${theme.muted('direct')} ${theme.muted('· no reasoning pass, so no thinking blocks')}`,
    );
    this.row(
      'data',
      `${theme.primaryLight(String(this.providerCount))} ${theme.muted('providers active')}`,
    );

    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        `  ${theme.muted('Ask a question, or')} ${theme.primaryLight('/help')} ${theme.muted('for every command.')} ${theme.primaryLight('/grade AAPL')} ${theme.muted('to score a ticker.')}`,
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));
  }
}
