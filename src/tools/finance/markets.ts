import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Additional financial-market integrations backed by free, key-less public APIs:
 *   - Foreign-exchange rates  → Frankfurter (European Central Bank reference rates)
 *   - Macroeconomic indicators → World Bank Open Data
 *
 * These broaden Antoine's coverage beyond the equities/crypto data provided by
 * Financial Datasets, and require no additional credentials.
 */

async function fetchJson(url: string, label: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${label}] network error: ${message}`);
    throw new Error(`[${label}] request failed: ${message}`);
  }
  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    logger.error(`[${label}] error: ${detail}`);
    throw new Error(`[${label}] request failed: ${detail}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Foreign exchange rates (Frankfurter — ECB reference rates, no API key)
// ---------------------------------------------------------------------------

export const FX_RATES_DESCRIPTION = `
Fetches foreign-exchange (currency) rates from the European Central Bank via Frankfurter. Use for:
- Current exchange rates between currencies (e.g., USD→EUR, GBP→JPY)
- Historical rates on a specific date
- A time series of rates across a date range

Covers major world currencies (USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, etc.). No API key required.
`.trim();

const FxRatesInputSchema = z.object({
  base: z
    .string()
    .default('USD')
    .describe("Base currency ISO code (e.g., 'USD', 'EUR'). Defaults to USD."),
  symbols: z
    .array(z.string())
    .optional()
    .describe("Target currency ISO codes to convert into (e.g., ['EUR','GBP']). Omit for all."),
  date: z
    .string()
    .optional()
    .describe('Single historical date in YYYY-MM-DD for a point-in-time rate.'),
  start_date: z
    .string()
    .optional()
    .describe('Start date (YYYY-MM-DD) for a time series. Use with end_date.'),
  end_date: z
    .string()
    .optional()
    .describe('End date (YYYY-MM-DD) for a time series. Use with start_date.'),
});

export const getFxRates = new DynamicStructuredTool({
  name: 'get_fx_rates',
  description:
    'Fetches foreign-exchange (currency) rates: latest, historical on a date, or a time series over a range. Powered by the European Central Bank (Frankfurter). No key required.',
  schema: FxRatesInputSchema,
  func: async (input) => {
    const base = input.base.trim().toUpperCase();
    const symbols = input.symbols?.map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];

    let path: string;
    if (input.start_date && input.end_date) {
      path = `${input.start_date}..${input.end_date}`;
    } else if (input.date) {
      path = input.date;
    } else {
      path = 'latest';
    }

    const url = new URL(`https://api.frankfurter.app/${path}`);
    url.searchParams.set('base', base);
    if (symbols.length > 0) {
      url.searchParams.set('symbols', symbols.join(','));
    }

    const data = await fetchJson(url.toString(), 'Frankfurter FX');
    return formatToolResult(data as Record<string, unknown>, [url.toString()]);
  },
});

// ---------------------------------------------------------------------------
// Macroeconomic indicators (World Bank Open Data, no API key)
// ---------------------------------------------------------------------------

const INDICATOR_CODES: Record<string, { code: string; label: string }> = {
  gdp: { code: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)' },
  gdp_growth: { code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (annual %)' },
  gdp_per_capita: { code: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)' },
  inflation: { code: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual %)' },
  unemployment: { code: 'SL.UEM.TOTL.ZS', label: 'Unemployment, total (% of labor force)' },
  interest_rate: { code: 'FR.INR.RINR', label: 'Real interest rate (%)' },
  population: { code: 'SP.POP.TOTL', label: 'Population, total' },
  government_debt: { code: 'GC.DOD.TOTL.GD.ZS', label: 'Central government debt, total (% of GDP)' },
};

export const ECONOMIC_INDICATORS_DESCRIPTION = `
Fetches macroeconomic indicators for a country from World Bank Open Data. Use for:
- GDP, GDP growth, GDP per capita
- Inflation (consumer prices)
- Unemployment rate
- Real interest rate, government debt, population

Supports a year range. Country accepts ISO-2 or ISO-3 codes (e.g., 'US', 'USA', 'DE', 'CN'). No API key required.
`.trim();

const EconomicIndicatorsInputSchema = z.object({
  country: z
    .string()
    .default('US')
    .describe("Country code, ISO-2 or ISO-3 (e.g., 'US', 'USA', 'DE', 'CN'). Defaults to US."),
  indicator: z
    .enum([
      'gdp',
      'gdp_growth',
      'gdp_per_capita',
      'inflation',
      'unemployment',
      'interest_rate',
      'population',
      'government_debt',
    ])
    .describe('Which macroeconomic indicator to retrieve.'),
  start_year: z
    .number()
    .optional()
    .describe('First year of data (e.g., 2015). Defaults to the last 10 years.'),
  end_year: z.number().optional().describe('Last year of data (e.g., 2024).'),
});

export const getEconomicIndicators = new DynamicStructuredTool({
  name: 'get_economic_indicators',
  description:
    'Fetches macroeconomic indicators (GDP, inflation, unemployment, interest rates, debt, population) for a country from World Bank Open Data. No key required.',
  schema: EconomicIndicatorsInputSchema,
  func: async (input) => {
    const mapping = INDICATOR_CODES[input.indicator];
    const country = input.country.trim().toUpperCase();
    const currentYear = new Date().getFullYear();
    const endYear = input.end_year ?? currentYear;
    const startYear = input.start_year ?? endYear - 10;

    const url = new URL(
      `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${mapping.code}`,
    );
    url.searchParams.set('format', 'json');
    url.searchParams.set('date', `${startYear}:${endYear}`);
    url.searchParams.set('per_page', '100');

    const raw = await fetchJson(url.toString(), 'World Bank');
    // World Bank returns [paginationMeta, dataArray]
    const series = Array.isArray(raw) && Array.isArray(raw[1]) ? raw[1] : [];
    const observations = (series as Array<Record<string, unknown>>)
      .map((row) => ({
        year: row.date,
        value: row.value,
        country: (row.country as { value?: string } | undefined)?.value,
      }))
      .filter((row) => row.value !== null && row.value !== undefined);

    return formatToolResult(
      {
        indicator: mapping.label,
        indicatorCode: mapping.code,
        country,
        observations,
      },
      [url.toString()],
    );
  },
});
