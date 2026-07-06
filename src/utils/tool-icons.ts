/**
 * Per-tool glyph + accent color registry. Replaces the hard-coded `⏺` circle
 * in `ToolEventComponent` with a tool-specific glyph and accent color so each
 * tool call has a distinct visual identity in the chat log.
 */
import type { ThemePaletteKey } from '../theme.js';

export interface ToolIcon {
  glyph: string;
  accent: ThemePaletteKey;
}

const DEFAULT_ICON: ToolIcon = { glyph: '⏺', accent: 'primary' };

const REGISTRY: Record<string, ToolIcon> = {
  // Market data
  get_stock_price: { glyph: '⌖', accent: 'primary' },
  get_stock_prices: { glyph: '⌗', accent: 'primary' },
  get_available_stock_tickers: { glyph: '⌗', accent: 'muted' },
  get_crypto_price_snapshot: { glyph: '₿', accent: 'accent' },
  get_crypto_prices: { glyph: '₿', accent: 'accent' },
  get_available_crypto_tickers: { glyph: '₿', accent: 'muted' },
  get_company_news: { glyph: '◳', accent: 'info' },
  get_insider_trades: { glyph: '◈', accent: 'warning' },
  get_institutional_holdings: { glyph: '⌸', accent: 'muted' },
  get_institutional_investors: { glyph: '⌸', accent: 'muted' },

  // Fundamentals
  get_income_statements: { glyph: '§', accent: 'success' },
  get_balance_sheets: { glyph: '§', accent: 'success' },
  get_cash_flow_statements: { glyph: '§', accent: 'success' },
  get_all_financial_statements: { glyph: '§', accent: 'success' },
  get_earnings: { glyph: '↑', accent: 'success' },
  get_key_ratios: { glyph: '%', accent: 'success' },
  get_historical_key_ratios: { glyph: '%', accent: 'success' },
  get_financial_segments: { glyph: '⌹', accent: 'success' },

  // Filings
  get_filings: { glyph: '⎙', accent: 'muted' },
  get_10K_filing_items: { glyph: '⎙', accent: 'muted' },
  get_10Q_filing_items: { glyph: '⎙', accent: 'muted' },
  get_8K_filing_items: { glyph: '⎙', accent: 'muted' },

  // Meta-tools
  get_financials: { glyph: '∑', accent: 'success' },
  get_market_data: { glyph: '∑', accent: 'primary' },
  read_filings: { glyph: '∑', accent: 'muted' },
  stock_screener: { glyph: '⊞', accent: 'primary' },

  // Macro / FX
  get_fx_rates: { glyph: '€', accent: 'info' },
  get_economic_indicators: { glyph: '⌬', accent: 'info' },
  get_fred_series: { glyph: '⎈', accent: 'info' },

  // Web / fetch
  web_search: { glyph: '⌕', accent: 'info' },
  web_fetch: { glyph: '⇩', accent: 'info' },
  x_search: { glyph: '𝕏', accent: 'primary' },
  browser: { glyph: '⊕', accent: 'info' },

  // Filesystem
  read_file: { glyph: '⎗', accent: 'muted' },
  write_file: { glyph: '✎', accent: 'warning' },
  edit_file: { glyph: '✎', accent: 'warning' },

  // Skills / agents
  skill: { glyph: '✦', accent: 'accent' },
  spawn_subagent: { glyph: '⇶', accent: 'accent' },

  // Memory / scheduling
  memory_search: { glyph: '⌘', accent: 'accent' },
  memory_get: { glyph: '⌘', accent: 'accent' },
  memory_update: { glyph: '⌘', accent: 'accent' },
  cron: { glyph: '◷', accent: 'muted' },
  heartbeat: { glyph: '♥', accent: 'warning' },

  // User
  ask_user_question: { glyph: '?', accent: 'accent' },

  // Roadmap providers (leaf tools, prefixed by their provider)
  alphavantage_stock_quote: { glyph: '⌖', accent: 'primary' },
  alphavantage_stock_time_series: { glyph: '⌗', accent: 'primary' },
  alphavantage_fx_rate: { glyph: '€', accent: 'info' },
  alphavantage_crypto_rating: { glyph: '₿', accent: 'accent' },
  polygon_stock_snapshot: { glyph: '⌖', accent: 'primary' },
  polygon_stock_aggregates: { glyph: '⌗', accent: 'primary' },
  polygon_forex_snapshot: { glyph: '€', accent: 'info' },
  finnhub_quote: { glyph: '⌖', accent: 'primary' },
  finnhub_company_profile: { glyph: '⌸', accent: 'muted' },
  finnhub_peers: { glyph: '⌸', accent: 'muted' },
  finnhub_recommendation: { glyph: '◊', accent: 'accent' },
  finnhub_sentiment: { glyph: '◊', accent: 'accent' },
  fmp_company_profile: { glyph: '⌸', accent: 'muted' },
  fmp_ratios: { glyph: '%', accent: 'success' },
  fmp_dcf_valuation: { glyph: '∑', accent: 'success' },
  fmp_income_statement: { glyph: '§', accent: 'success' },
  fmp_balance_sheet: { glyph: '§', accent: 'success' },
  twelvedata_time_series: { glyph: '⌗', accent: 'primary' },
  twelvedata_quote: { glyph: '⌖', accent: 'primary' },
  twelvedata_fx_rate: { glyph: '€', accent: 'info' },
  tiingo_eod_prices: { glyph: '⌗', accent: 'primary' },
  tiingo_fundamentals: { glyph: '§', accent: 'success' },
  eodhd_eod_prices: { glyph: '⌗', accent: 'primary' },
  eodhd_fundamentals: { glyph: '§', accent: 'success' },
  coingecko_simple_price: { glyph: '₿', accent: 'accent' },
  coingecko_markets: { glyph: '₿', accent: 'accent' },
  coingecko_global_metrics: { glyph: '⌬', accent: 'info' },
  cmc_listings: { glyph: '₿', accent: 'accent' },
  cmc_quotes: { glyph: '₿', accent: 'accent' },
  cmc_global_metrics: { glyph: '⌬', accent: 'info' },
  rentcast_rent_estimate: { glyph: '⌂', accent: 'info' },
  rentcast_value_estimate: { glyph: '⌂', accent: 'info' },
  realtor_properties_for_sale: { glyph: '⌂', accent: 'info' },
  newsapi_everything: { glyph: '◳', accent: 'info' },
  marketaux_news: { glyph: '◳', accent: 'info' },
  benzinga_news: { glyph: '◳', accent: 'info' },
};

/** Look up the icon for a tool name, falling back to a default. */
export function getToolIcon(toolName: string): ToolIcon {
  return REGISTRY[toolName] ?? DEFAULT_ICON;
}