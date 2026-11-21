// The source lists live in the core, shared with the Studio extension. Reading
// a source's latest value needs the network, so it stays here.

export * from '../extension/ui/core/sources.ts';

export interface Reading {
  value: number;
  period: string;
}

/** The latest value, or null when the source can't be read from a browser. */
export async function latest(provider: string, series: string): Promise<Reading | null> {
  try {
    if (provider === 'worldbank') {
      const [code, area = 'WLD'] = series.split(':');
      const res = await fetch(`https://api.worldbank.org/v2/country/${encodeURIComponent(area)}/indicator/${encodeURIComponent(code)}?format=json&mrnev=1`);
      const row = (await res.json())?.[1]?.[0];
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
  return null; // Other publishers need a key or a server: open the source to see it.
}

