import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { fetchJson } from './utils.js';

/**
 * Additional financial-market integrations backed by free, key-less public APIs:
 *   - Foreign-exchange rates  → Frankfurter (European Central Bank reference rates)
 *   - Macroeconomic indicators → World Bank Open Data
 *   - US macro time series     → FRED (St. Louis Fed) — gated by FRED_API_KEY
 *
 * These broaden Antoine's coverage beyond the equities/crypto data provided by
 * Financial Datasets. FX and World Bank need no key; FRED is opt-in via .env.
 */

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

// ---------------------------------------------------------------------------
// FRED — US Federal Reserve Economic Data (St. Louis Fed)
// ---------------------------------------------------------------------------

const FRED_SERIES: Record<string, { code: string; label: string; units?: string }> = {
  fed_funds: { code: 'DFF', label: 'Federal Funds Effective Rate', units: 'percent' },
  cpi: { code: 'CPIAUCSL', label: 'Consumer Price Index (All Urban Consumers)', units: 'index' },
  cpi_yoy: { code: 'CPIAUCSL', label: 'Consumer Price Index (YoY % change computed)' },
  treasury_10y: { code: 'DGS10', label: '10-Year Treasury Constant Maturity Rate', units: 'percent' },
  treasury_2y: { code: 'DGS2', label: '2-Year Treasury Constant Maturity Rate', units: 'percent' },
  unemployment: { code: 'UNRATE', label: 'Unemployment Rate', units: 'percent' },
  gdp: { code: 'GDP', label: 'Gross Domestic Product', units: 'billions of $' },
  pce: { code: 'PCEPI', label: 'Personal Consumption Expenditures Price Index', units: 'index' },
  m2: { code: 'M2SL', label: 'M2 Money Stock', units: 'billions of $' },
};

export const FRED_DESCRIPTION = `
Fetches US Federal Reserve Economic Data (FRED) time series from the St. Louis Fed. Use for:
- Fed funds rate (DFF), Treasury yields (DGS10, DGS2)
- CPI / inflation (CPIAUCSL, PCEPI)
- Unemployment (UNRATE)
- GDP, M2 money supply

Pick a series by name (e.g. 'fed_funds', 'cpi', 'treasury_10y', 'unemployment'). Date range defaults to the last 5 years. Requires FRED_API_KEY.
`.trim();

const FredInputSchema = z.object({
  series: z
    .enum([
      'fed_funds',
      'cpi',
      'cpi_yoy',
      'treasury_10y',
      'treasury_2y',
      'unemployment',
      'gdp',
      'pce',
      'm2',
    ])
    .describe('Which FRED series to fetch.'),
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 5 years ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
});

export const getFredSeries = new DynamicStructuredTool({
  name: 'get_fred_series',
  description:
    'Fetches a US Federal Reserve (FRED) macroeconomic time series. Covers Fed funds, Treasury yields, CPI/inflation, unemployment, GDP, and money supply.',
  schema: FredInputSchema,
  func: async (input) => {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) {
      throw new Error('[FRED API] FRED_API_KEY is not set');
    }

    const meta = FRED_SERIES[input.series];
    const today = new Date();
    const endYear = input.end_date
      ? input.end_date.slice(0, 4)
      : String(today.getFullYear());
    const startYear = input.start_date
      ? input.start_date.slice(0, 4)
      : String(today.getFullYear() - 5);

    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.searchParams.set('series_id', meta.code);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('observation_start', `${startYear}-01-01`);
    url.searchParams.set('observation_end', `${endYear}-12-31`);

    const raw = (await fetchJson(url.toString(), 'FRED API')) as {
      observations?: Array<{ date: string; value: string }>;
    };
    const raw_obs = (raw.observations ?? []).filter((o) => o.value !== '.');

    // CPI YoY needs percent change vs same month prior year.
    let observations: Array<{ date: string; value: number | null }> = raw_obs.map((o) => ({
      date: o.date,
      value: Number(o.value),
    }));
    if (input.series === 'cpi_yoy') {
      const byMonth = new Map(observations.map((o) => [o.date.slice(0, 7), o.value] as const));
      observations = observations.map((o) => {
        const yyyymm = o.date.slice(0, 4) + o.date.slice(5, 7);
        void yyyymm;
        const prior = byMonth.get(o.date.slice(0, 4) === startYear ? '' : '');
        const yyyy = Number(o.date.slice(0, 4));
        const priorMonth = `${yyyy - 1}${o.date.slice(5)}`;
        const priorValue = byMonth.get(priorMonth.slice(0, 7));
        if (typeof o.value === 'number' && typeof priorValue === 'number' && priorValue !== 0) {
          return { date: o.date, value: ((o.value - priorValue) / priorValue) * 100 };
        }
        return { date: o.date, value: null };
      }).filter((o) => o.value !== null);
    }

    return formatToolResult(
      {
        series: input.series,
        label: meta.label,
        units: meta.units,
        observations,
      },
      [url.toString()],
    );
  },
});
