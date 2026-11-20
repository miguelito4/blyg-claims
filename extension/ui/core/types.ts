// Shapes of the claim and resolution blocks (schema/*.schema.json) and the
// validators the parser uses. Hand-written so the core has no dependencies.

export interface ClaimBlock {
  claim?: string;
  probability: number;
  resolves_by: string;
  criteria?: string;
  provenance?: string;
  discussion?: string;
  tags?: string[];
  commit?: string;
  [extra: string]: unknown;
}

export type Outcome = true | false | 'void';

export interface ResolutionBlock {
  outcome: Outcome;
  resolved_at?: string;
  evidence?: string[];
  note?: string;
  reveal?: { salt: string; text: string };
  [extra: string]: unknown;
}

export interface Issue {
  level: 'error' | 'warning';
  /** 1-based line of the fence the issue is about, or 0 for the whole item. */
  line: number;
  message: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(o: Record<string, unknown>, key: string, problems: string[]): void {
  if (key in o && (typeof o[key] !== 'string' || (o[key] as string).trim() === '')) problems.push(`\`${key}\` must be a non-empty string`);
}

function optionalStringArray(o: Record<string, unknown>, key: string, problems: string[]): void {
  if (key in o && !(Array.isArray(o[key]) && (o[key] as unknown[]).every((x) => typeof x === 'string' && x.trim() !== ''))) {
    problems.push(`\`${key}\` must be an array of non-empty strings`);
  }
}

/** Errors that make a claim block unusable, and warnings that don't. */
export function checkClaim(value: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(value)) return { errors: ['a claim block must be a JSON object'], warnings };
  const p = value.probability;
  if (typeof p !== 'number' || !Number.isFinite(p)) errors.push('`probability` must be a number');
  else if (p <= 0 || p >= 1) errors.push('`probability` must be strictly between 0 and 1');
  if (!isIsoDate(value.resolves_by)) errors.push('`resolves_by` must be a date in YYYY-MM-DD form');
  for (const key of ['claim', 'criteria', 'provenance', 'discussion']) optionalString(value, key, errors);
  optionalStringArray(value, 'tags', errors);
  if ('commit' in value && !(typeof value.commit === 'string' && /^sha256:[0-9a-f]{64}$/.test(value.commit))) {
    errors.push('`commit` must be sha256: followed by 64 lowercase hex digits');
  }
  if (!('claim' in value)) warnings.push('no `claim`: the statement is only in the prose');
  if (!('criteria' in value)) warnings.push('no `criteria`: nobody else can resolve this');
  return { errors, warnings };
}

export function checkResolution(value: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(value)) return { errors: ['a resolution block must be a JSON object'], warnings };
  if (!(value.outcome === true || value.outcome === false || value.outcome === 'void')) {
    errors.push('`outcome` must be true, false or "void"');
  }
  if ('resolved_at' in value && !isIsoDate(value.resolved_at)) errors.push('`resolved_at` must be a date in YYYY-MM-DD form');
  optionalStringArray(value, 'evidence', errors);
  optionalString(value, 'note', errors);
  if ('reveal' in value) {
    const r = value.reveal;
    if (!isObject(r) || typeof r.salt !== 'string' || typeof r.text !== 'string') errors.push('`reveal` must have string `salt` and `text`');
  }
  if (!('evidence' in value) && value.outcome !== 'void') warnings.push('no `evidence`');
  return { errors, warnings };
}
