import { Container, Spacer, Text } from '@mariozechner/pi-tui';
import packageJson from '../../package.json';
import { getModelDisplayName } from '../utils/model.js';
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
  private providerName: string | null = null;

  constructor(model: string, providerName?: string) {
    super();
    this.model = model;
    this.providerName = providerName ?? null;
    this.build();
  }

  setModel(model: string) {
    this.model = model;
    this.build();
  }

  setProvider(providerName: string) {
    this.providerName = providerName;
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
    this.addChild(new Text(theme.bold(theme.primary(BANNER)), 0, 0));
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
    const modelValue = this.providerName
      ? `${theme.primaryLight(getModelDisplayName(this.model))} ${theme.muted(`· ${this.providerName}`)}`
      : theme.primaryLight(getModelDisplayName(this.model));
    this.row('model', modelValue);

    // Say plainly whether to expect reasoning blocks, rather than leaving the
    // user to wonder why they do or do not appear.
    this.row(
      'mode',
      caps.reasoning
        ? `${theme.accent('thinking')} ${theme.muted('· reasoning shown as it happens')}`
        : `${theme.muted('direct')} ${theme.muted('· no reasoning pass')}`,
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
