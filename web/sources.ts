// Indicators people can pick instead of typing IDs, and live readings where a
// source allows a browser to read it. A reading that fails is not an error:
// the claim can still be made, and the page says the reading was unavailable.

export type Frequency = 'monthly' | 'quarterly' | 'annual';

export interface Indicator {
  provider: 'fred' | 'worldbank' | 'owid' | 'bis';
  /** The series as the check names it, before @date. */
  series: string;
  name: string;
  unit: string;
  frequency: Frequency;
  url: string;
}

export const INDICATORS: Indicator[] = [
  { provider: 'fred', series: 'UNRATE', name: 'US unemployment rate', unit: '%', frequency: 'monthly', url: 'https://fred.stlouisfed.org/series/UNRATE' },
  { provider: 'fred', series: 'CPIAUCSL', name: 'US consumer prices (CPI-U index)', unit: 'index', frequency: 'monthly', url: 'https://fred.stlouisfed.org/series/CPIAUCSL' },
  { provider: 'fred', series: 'BOPGSTB', name: 'US trade balance, goods and services', unit: '$ million', frequency: 'monthly', url: 'https://fred.stlouisfed.org/series/BOPGSTB' },
  { provider: 'fred', series: 'LEU0254530200Q', name: 'US median weekly earnings, professional workers', unit: '$', frequency: 'quarterly', url: 'https://fred.stlouisfed.org/series/LEU0254530200Q' },
  { provider: 'worldbank', series: 'SI.POV.DDAY:WLD', name: 'World: share of people living on under $3.00 a day', unit: '%', frequency: 'annual', url: 'https://data.worldbank.org/indicator/SI.POV.DDAY' },
  { provider: 'owid', series: 'share-electricity-renewables:World', name: 'World: share of electricity from renewables', unit: '%', frequency: 'annual', url: 'https://ourworldindata.org/grapher/share-electricity-renewables' },
];

export const PROVIDER_HOME: Record<Indicator['provider'], { name: string; url: string; hint: string }> = {
  fred: { name: 'FRED', url: 'https://fred.stlouisfed.org/', hint: 'The series ID shown on the page, e.g. UNRATE' },
  worldbank: { name: 'World Bank', url: 'https://data.worldbank.org/indicator', hint: 'Indicator code and country, e.g. SI.POV.DDAY:WLD' },
  owid: { name: 'Our World in Data', url: 'https://ourworldindata.org/charts', hint: 'Chart name and entity, e.g. share-electricity-renewables:World' },
  bis: { name: 'BIS', url: 'https://data.bis.org/', hint: 'The series key shown on data.bis.org' },
};

export interface Reading {
  value: number;
  period: string;
}

/** The latest value, or null when the source can't be read from a browser. */
export async function latest(provider: Indicator['provider'], series: string): Promise<Reading | null> {
  try {
    if (provider === 'worldbank') {
      const [code, area = 'WLD'] = series.split(':');
      const res = await fetch(`https://api.worldbank.org/v2/country/${encodeURIComponent(area)}/indicator/${encodeURIComponent(code)}?format=json&mrnev=1`);
      const json = await res.json();
      const row = json?.[1]?.[0];
      return row && typeof row.value === 'number' ? { value: row.value, period: String(row.date) } : null;
    }
    if (provider === 'owid') {
      const [slug, entity = 'World'] = series.split(':');
      const res = await fetch(`https://ourworldindata.org/grapher/${encodeURIComponent(slug)}.csv?v=1&csvType=full&useColumnShortNames=true`);
      const rows = (await res.text()).trim().split('\n').map((l) => l.split(','));
      const mine = rows.slice(1).filter((r) => r[0] === entity);
      const last = mine[mine.length - 1];
      return last ? { value: Number(last[last.length - 1]), period: last[2] } : null;
    }
  } catch {
    return null;
  }
  return null; // FRED and BIS need a key or a server: open the source to see it.
}
