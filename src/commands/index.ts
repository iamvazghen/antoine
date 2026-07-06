export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'model', description: 'Switch LLM provider and model' },
  { name: 'search', description: 'Choose preferred web search provider' },
  { name: 'theme', description: 'Switch the color theme (emerald · sapphire · amethyst · obsidian)' },
  { name: 'rules', description: 'Show your research rules' },
  { name: 'clear', description: 'Clear the conversation' },
  { name: 'memory', description: 'Show what Antoine remembers about you' },
  { name: 'heartbeat', description: 'Show your heartbeat monitoring checklist' },
  { name: 'history', description: 'Show recent conversation summaries' },
  { name: 'sessions', description: 'List saved sessions you can resume' },
  { name: 'resume', description: 'Resume your most recent previous session' },
  { name: 'palette', description: 'Open the fuzzy command palette (also Ctrl+P)' },
  { name: 'providers', description: 'Show which roadmap data providers are active' },
  { name: 'cost', description: 'Show running session cost (or set cap: /cost cap 5)' },
  { name: 'watch', description: 'Add tickers to the watchlist: /watch AAPL NVDA MSFT' },
  { name: 'unwatch', description: 'Remove tickers: /unwatch AAPL' },
  { name: 'watchlist', description: 'Show the current watchlist' },
  { name: 'help', description: 'Show keyboard shortcuts and tips' },
];

/**
 * Filter commands matching the current input.
 * Input should start with "/". Bare "/" returns all commands.
 */
export function matchCommands(input: string): SlashCommand[] {
  const query = input.slice(1).toLowerCase();
  if (query === '') return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(cmd => cmd.name.startsWith(query));
}
