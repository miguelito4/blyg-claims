// From the composer's answers to a claim block, and the checks that catch the
// mistakes people make before they publish. Pure; the composer page and the
// tests both use it.

import type { Check } from './check.ts';
import { SOMETHING_ELSE, type Outcome, type Pick, type Shape } from './shapes.ts';
import type { ClaimBlock } from './types.ts';

export interface Draft {
  shape: Shape;
  statement: string;
  resolvesBy: string;
  /** binary, 0–1 */
  probability?: number;
  /** choice */
  pick?: Pick;
  options?: { label: string; percent?: number }[];
  size?: number;
  /** choice: true when the writer ranks without percentages */
  rankOnly?: boolean;
  /** quantity */
  low?: number;
  high?: number;
  unit?: string;
  confidence?: number;
  check?: Check;
  voidsIf?: string;
  provenance?: string;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** A plain-language sentence saying how the outcome is decided, used as `criteria`. */
export function describeCheck(check: Check | undefined): string {
  if (!check) return '';
  const cmp = 'op' in check && check.op ? `${words(check.op)} ${check.threshold}` : '';
  switch (check.oracle) {
    case 'blyg':
      return check.metric === 'item_exists'
        ? `The item ${check.item} is published and not withdrawn.`
        : `The number of blygs${check.among === 'directory' || !check.among ? ' in the blygger.com directory' : ''}${check.exclude?.length ? ` (not counting ${check.exclude.join(', ')})` : ''} with at least one claim ${cmp}.`;
    case 'data_series':
      return `${check.value} on ${providerName(check.provider)}, as published on ${check.as_of}${cmp ? `, ${cmp}` : ''}.`;
    case 'record':
      return `The ${registryName(check.registry)} record ${check.id} shows: ${check.event}.`;
    case 'web_data':
      return `The value at ${check.pointer} in ${check.url}${cmp ? ` ${cmp}` : ''}.`;
    case 'judgment':
      return check.by === 'author' ? `The author decides${check.evidence ? `, from ${check.evidence}` : ''}.` : `Decided by ${check.by.join(', ')}${check.evidence ? `, from ${check.evidence}` : ''}.`;
  }
}

export function words(op: string): string {
  return ({ '>': 'is above', '>=': 'is at least', '<': 'is below', '<=': 'is at most', '==': 'equals', '!=': 'is not' } as Record<string, string>)[op] ?? op;
}

const PROVIDER_NAMES: Record<string, string> = {
  owid: 'Our World in Data', worldbank: 'the World Bank', un: 'the UN SDG database', imf: 'the IMF', oecd: 'the OECD', bis: 'the BIS',
  ecb: 'the European Central Bank', eurostat: 'Eurostat', ons: 'the UK Office for National Statistics', fred: 'FRED',
  who: 'the WHO Global Health Observatory', ilo: 'ILOSTAT', fao: 'FAOSTAT', unhcr: 'UNHCR', noaa: 'NOAA', copernicus: 'Copernicus', ember: 'Ember',
  other: 'its official publisher',
};

const REGISTRY_NAMES: Record<string, string> = {
  eurlex: 'EUR-Lex', legislation_uk: 'legislation.gov.uk', uk_bills: 'UK Parliament bills', congress: 'congress.gov',
  companies_house: 'Companies House', sec: 'SEC EDGAR', doi: 'DOI', arxiv: 'arXiv', pubmed: 'PubMed', who_ictrp: 'WHO ICTRP',
  clinicaltrials: 'ClinicalTrials.gov', ema: 'European Medicines Agency', fda: 'FDA', espacenet: 'Espacenet', wipo: 'WIPO Patentscope',
  uspto: 'USPTO', icj: 'International Court of Justice', curia: 'Court of Justice of the EU', bailii: 'BAILII', courtlistener: 'CourtListener',
  github: 'GitHub', other: 'official',
};

export function providerName(p: string): string {
  return PROVIDER_NAMES[p] ?? p;
}

export function registryName(r: string): string {
  return REGISTRY_NAMES[r] ?? r;
}

export const NAMED = { providers: Object.keys(PROVIDER_NAMES), registries: Object.keys(REGISTRY_NAMES) };

/** The claim block the draft becomes. Only fields the shape uses are written. */
export function toClaim(d: Draft): ClaimBlock {
  const c: ClaimBlock = { claim: clean(d.statement), resolves_by: d.resolvesBy } as ClaimBlock;
  if (d.shape !== 'binary') c.shape = d.shape;
  if (d.shape === 'binary') c.probability = round(d.probability ?? 0.5);
  if (d.shape === 'choice') {
    c.pick = d.pick ?? 'one';
    const opts = (d.options ?? []).map((o) => ({ ...o, label: clean(o.label) })).filter((o) => o.label);
    const usePct = !d.rankOnly && c.pick !== 'order';
    c.outcomes = opts.map((o): Outcome => (usePct && o.percent !== undefined ? { label: o.label, probability: round(o.percent / 100) } : { label: o.label }));
    if (c.pick !== 'one') c.size = d.size;
  }
  if (d.shape === 'quantity') {
    c.range = [d.low ?? 0, d.high ?? 0];
    c.confidence = round(d.confidence ?? 0.8);
    if (clean(d.unit)) c.unit = clean(d.unit);
  }
  if (d.check) {
    c.check = d.check;
    c.criteria = describeCheck(d.check);
  }
  if (clean(d.voidsIf)) c.voids_if = clean(d.voidsIf);
  if (clean(d.provenance)) c.provenance = clean(d.provenance);
  return c;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The item's Markdown: the statement as prose, then the block. */
export function toMarkdown(claim: ClaimBlock): string {
  return `${claim.claim}\n\n\`\`\`claim\n${JSON.stringify(claim, null, 2)}\n\`\`\`\n`;
}

/** Adds the catch-all to a "pick one" list if it isn't there. */
export function withCatchAll(options: { label: string; percent?: number }[]): { label: string; percent?: number }[] {
  return options.some((o) => clean(o.label).toLowerCase() === SOMETHING_ELSE.toLowerCase()) ? options : [...options, { label: SOMETHING_ELSE }];
}

export interface Mistake {
  level: 'stop' | 'warn';
  message: string;
}

export interface Facts {
  /** Today, YYYY-MM-DD. */
  today: string;
  /** The source's latest reading, when the composer could fetch it. */
  latest?: { value: number | boolean; period: string };
  /** How often the source publishes, when known. */
  frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
}

const VAGUE = ['significant', 'significantly', 'substantial', 'mainstream', 'major', 'soon', 'widely', 'many', 'a lot', 'considerably', 'meaningful'];

// Typical gap between a period ending and its data being published.
const LAG_DAYS: Record<string, number> = { daily: 3, weekly: 10, monthly: 45, quarterly: 130, annual: 400 };

/**
 * What a careful reader would object to before the claim is published.
 * "stop" blocks publishing; "warn" is shown and the writer decides.
 */
export function mistakes(d: Draft, facts: Facts): Mistake[] {
  const out: Mistake[] = [];
  const statement = clean(d.statement);

  if (!statement) out.push({ level: 'stop', message: 'Say what you think will happen.' });
  if (!d.resolvesBy) out.push({ level: 'stop', message: 'Pick a date by which it will be known.' });
  else if (d.resolvesBy <= facts.today) out.push({ level: 'stop', message: 'That date has already passed. Pick one in the future.' });

  const vague = VAGUE.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(statement));
  if (vague.length && d.shape !== 'record') {
    out.push({ level: 'warn', message: `"${vague[0]}" means different things to different people. Say exactly what counts, or let the source decide.` });
  }

  if (d.shape !== 'record' && !d.check) out.push({ level: 'stop', message: 'Say how we will know. If nothing can check it, choose "Someone decides" or "Just record it".' });
  if (d.shape === 'binary' && d.check && d.check.oracle !== 'judgment' && d.check.oracle !== 'record' && !('op' in d.check && d.check.op)) {
    out.push({ level: 'stop', message: 'Say what the number has to do: rise above, fall below, and by how much.' });
  }

  if (d.shape === 'binary' && d.probability !== undefined && (d.probability <= 0.02 || d.probability >= 0.98)) {
    out.push({ level: 'warn', message: 'At this confidence you are saying it is all but certain. If so, is it worth forecasting?' });
  }

  if (d.shape === 'choice') {
    const opts = (d.options ?? []).filter((o) => clean(o.label));
    if (opts.length < 2) out.push({ level: 'stop', message: 'List at least two outcomes.' });
    if ((d.pick === 'set' || d.pick === 'order') && !(d.size && d.size >= 1 && d.size < opts.length)) {
      out.push({ level: 'stop', message: d.pick === 'set' ? 'Say how many make it, fewer than the outcomes listed.' : 'Say how many you are ranking, fewer than the outcomes listed.' });
    }
    if (!d.rankOnly && d.pick !== 'order' && opts.some((o) => o.percent !== undefined)) {
      const sum = opts.reduce((a, o) => a + (o.percent ?? 0), 0);
      const want = d.pick === 'set' ? (d.size ?? 0) * 100 : 100;
      if (Math.abs(sum - want) > 0.5) out.push({ level: 'stop', message: `The percentages add up to ${Math.round(sum)}%; they should add up to ${want}%.` });
    }
  }

  if (d.shape === 'quantity') {
    if (d.low === undefined || d.high === undefined || d.low >= d.high) out.push({ level: 'stop', message: 'Give a range with the low end below the high end.' });
  }

  // The three mistakes that look fine on the surface.
  const check = d.check;
  if (check && 'op' in check && check.op && facts.latest && typeof facts.latest.value === 'number' && typeof check.threshold === 'number') {
    const v = facts.latest.value;
    const t = check.threshold;
    const already = { '>': v > t, '>=': v >= t, '<': v < t, '<=': v <= t, '==': v === t, '!=': v !== t }[check.op as string];
    if (already && d.shape === 'binary') {
      out.push({ level: 'warn', message: `It is already true: the latest reading is ${v} (${facts.latest.period}). Unless you expect it to reverse, this claim says nothing new.` });
    }
  }
  if (check && check.oracle === 'data_series' && facts.frequency && d.resolvesBy) {
    const m = /@(\d{4}-\d{2}-\d{2})/.exec(check.value);
    if (m) {
      const due = addDays(m[1], LAG_DAYS[facts.frequency] + periodDays(facts.frequency));
      if (due > d.resolvesBy) {
        out.push({ level: 'stop', message: `Data for ${m[1]} is usually published around ${due}, after your date. Pick ${due} or later.` });
      }
    }
  }
  if (check && 'op' in check && (check.op === '!=' || (check.op === '==' && typeof check.threshold === 'number'))) {
    out.push({ level: 'warn', message: `"${words(check.op)} exactly ${check.threshold}" is almost never what people mean with a number. Use above or below.` });
  }
  return out;
}

function periodDays(f: string): number {
  return ({ daily: 1, weekly: 7, monthly: 31, quarterly: 92, annual: 366 } as Record<string, number>)[f] ?? 0;
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
