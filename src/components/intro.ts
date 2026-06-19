import { Container, Spacer, Text } from '@mariozechner/pi-tui';
import packageJson from '../../package.json';
import { getModelDisplayName } from '../utils/model.js';
import { theme } from '../theme.js';

const INTRO_WIDTH = 50;

const BANNER = `
 █████╗ ███╗   ██╗████████╗ ██████╗ ██╗███╗   ██╗███████╗
██╔══██╗████╗  ██║╚══██╔══╝██╔═══██╗██║████╗  ██║██╔════╝
███████║██╔██╗ ██║   ██║   ██║   ██║██║██╔██╗ ██║█████╗
██╔══██║██║╚██╗██║   ██║   ██║   ██║██║██║╚██╗██║██╔══╝
██║  ██║██║ ╚████║   ██║   ╚██████╔╝██║██║ ╚████║███████╗
╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝`;

export class IntroComponent extends Container {
  private model: string;

  constructor(model: string) {
    super();
    this.model = model;
    this.build();
  }

  setModel(model: string) {
    this.model = model;
    this.build();
  }

  /**
   * Re-render the intro with the current theme colors. Called on theme change —
   * the banner/version strings are colored at build time, so they must be
   * rebuilt (rather than cached once in the constructor) to recolor live.
   */
  refresh() {
    this.build();
  }

  private build() {
    this.clear();

    const welcomeText = 'Welcome to Antoine';
    const versionText = ` v${packageJson.version}`;
    const fullText = welcomeText + versionText;
    const padding = Math.floor((INTRO_WIDTH - fullText.length - 2) / 2);
    const trailing = INTRO_WIDTH - fullText.length - padding - 2;

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.primary('═'.repeat(INTRO_WIDTH)), 0, 0));
    this.addChild(
      new Text(
        theme.primary(
          `║${' '.repeat(padding)}${theme.bold(welcomeText)}${theme.muted(versionText)}${' '.repeat(
            trailing,
          )}║`,
        ),
        0,
        0,
      ),
    );
    this.addChild(new Text(theme.primary('═'.repeat(INTRO_WIDTH)), 0, 0));
    this.addChild(new Spacer(1));

    this.addChild(new Text(theme.bold(theme.primary(BANNER)), 0, 0));

    this.addChild(new Spacer(1));
    this.addChild(new Text('Your AI assistant for deep financial research.', 0, 0));
    this.addChild(
      new Text(`${theme.muted('Model: ')}${theme.primary(getModelDisplayName(this.model))}`, 0, 0),
    );
  }
}
