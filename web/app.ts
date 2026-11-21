// The composer: plain questions in, a checkable claim out. The engineering
// (shapes, oracles, JSON) is built from the answers and only shown on request.

import { mistakes, toClaim, toMarkdown, withCatchAll, type Draft, type Mistake } from '../extension/ui/core/compose.ts';
import { resolvesBy, type Check } from '../extension/ui/core/check.ts';
import { SOMETHING_ELSE, type Pick, type Shape } from '../extension/ui/core/shapes.ts';
import { canRead, connect, disconnect, findBlyg, finishConnect, savedConnection, type Connection } from './oauth.ts';
import { listClaims, publishClaim, resolveClaim, type MyClaim, type Published } from './studio.ts';
import { checkAnswer, toResolution, describeOutcome, type Answer } from '../extension/ui/core/resolve.ts';
import { shapeOf } from '../extension/ui/core/shapes.ts';
import { INDICATORS, PUBLISHERS, REGISTERS, grouped, latest, type Indicator, type Reading } from './sources.ts';

type Kind = 'blyg' | 'data_series' | 'record' | 'web_data' | 'judgment';

const today = new Date().toISOString().slice(0, 10);

const S = {
  shape: null as Shape | null,
  statement: '',
  resolvesBy: '',
  probability: 70,
  pick: 'one' as Pick,
  options: [{ label: '' }, { label: '' }] as { label: string; percent?: number }[],
  size: 2,
  rankOnly: false,
  low: '',
  high: '',
  unit: '',
  confidence: 80,
  kind: 'judgment' as Kind | null,
  checkable: false,
  blygMetric: 'blygs_with_claims' as 'blygs_with_claims' | 'item_exists',
  excludeMine: true,
  item: '',
  op: '>' as string,
  threshold: '',
  indicator: '0',
  freq: 'monthly' as Indicator['frequency'],
  provider: 'owid',
  series: '',
  period: '',
  registry: 'arxiv',
  recordId: '',
  event: '',
  url: '',
  pointer: '',
  judgeBy: 'author',
  judges: '',
  evidence: '',
  voidsIf: '',
  provenance: '',
  showJson: false,
};

let reading: Reading | null = null;
let readingState: 'idle' | 'loading' | 'none' | 'ok' = 'idle';
let conn: Connection | null = savedConnection();
let blygInput = '';
let notice: { kind: 'error' | 'ok'; text: string } | null = null;
let published: Published | null = null;
let busy = false;
let view: 'new' | 'mine' = 'new';
let mine: MyClaim[] | null = null;
let mineState: 'idle' | 'loading' | 'error' = 'idle';
const R = { id: '', choice: '' as '' | 'yes' | 'no' | 'void', labels: [] as string[], value: '', evidence: '', note: '' };

const app = document.getElementById('app')!;

const h = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));

function indicator(): Indicator | null {
  return S.indicator === 'custom' ? null : INDICATORS[Number(S.indicator)] ?? null;
}

function frequency(): Indicator['frequency'] {
  return indicator()?.frequency ?? S.freq;
}

function periodDate(): string {
  const f = frequency();
  if (!S.period) return '';
  return f === 'annual' ? `${S.period.slice(0, 4)}-01-01` : `${S.period.slice(0, 7)}-01`;
}

function buildCheck(): Check | undefined {
  const t = num(S.threshold);
  const cmp = S.shape === 'binary' && t !== undefined ? { op: S.op as '>', threshold: t } : {};
  switch (S.kind) {
    case 'blyg':
      if (S.blygMetric === 'item_exists') return S.item ? { oracle: 'blyg', metric: 'item_exists', item: S.item, op: '==', threshold: true } : undefined;
      return { oracle: 'blyg', metric: 'blygs_with_claims', among: 'directory', exclude: S.excludeMine && conn ? [conn.origin] : [], ...cmp } as Check;
    case 'data_series': {
      const ind = indicator();
      const series = ind ? ind.series : S.series.trim();
      const date = periodDate();
      if (!series || !date) return undefined;
      return { oracle: 'data_series', provider: ind ? ind.provider : S.provider, value: `${series}@${date}`, as_of: S.resolvesBy || today, ...cmp } as Check;
    }
    case 'record':
      return S.recordId && S.event ? { oracle: 'record', registry: S.registry as 'arxiv', id: S.recordId.trim(), event: S.event.trim() } : undefined;
    case 'web_data':
      return S.url && S.pointer ? ({ oracle: 'web_data', url: S.url.trim(), pointer: S.pointer.trim(), ...cmp } as Check) : undefined;
    case 'judgment': {
      const by = S.judgeBy === 'author' ? 'author' : S.judges.split(/[\s,]+/).filter(Boolean);
      if (Array.isArray(by) && !by.length) return undefined;
      return { oracle: 'judgment', by, ...(S.evidence ? { evidence: S.evidence.trim() } : {}) } as Check;
    }
  }
  return undefined;
}

function draft(): Draft {
  const opts = S.pick === 'one' && S.shape === 'choice' ? withCatchAll(S.options) : S.options;
  return {
    shape: S.shape ?? 'binary',
    statement: S.statement,
    resolvesBy: S.resolvesBy,
    probability: S.probability / 100,
    pick: S.pick,
    options: opts,
    size: S.size,
    rankOnly: S.rankOnly,
    low: num(S.low),
    high: num(S.high),
    unit: S.unit,
    confidence: S.confidence / 100,
    check: S.shape === 'record' ? undefined : buildCheck(),
    voidsIf: S.voidsIf,
    provenance: S.provenance,
  };
}

function problems(): Mistake[] {
  if (!S.shape) return [];
  return mistakes(draft(), {
    today,
    latest: reading ?? undefined,
    frequency: S.kind === 'data_series' ? frequency() : undefined,
  });
}

const sureWord = (p: number) => (p < 20 ? 'Very unlikely' : p < 40 ? 'Unlikely' : p < 60 ? 'Toss-up' : p < 80 ? 'Likely' : p < 95 ? 'Very likely' : 'Near certain');

// ---------- rendering ----------

function choiceCard(name: string, value: string, current: string | null, title: string, body: string): string {
  const on = value === current;
  return `<label class="card${on ? ' on' : ''}"><input type="radio" name="${name}" value="${h(value)}" data-set="${name}"${on ? ' checked' : ''}><span><b>${title}</b><small>${body}</small></span></label>`;
}

function stepKind(): string {
  return `<section><h2><span>1</span>What kind of claim is this?</h2><div class="grid2">
    ${choiceCard('shape', 'binary', S.shape, 'Yes or no', 'Will it happen?')}
    ${choiceCard('shape', 'choice', S.shape, 'From a list', 'Who wins, who makes it, or in what order.')}
    ${choiceCard('shape', 'quantity', S.shape, 'How much', 'A number, with a range.')}
    ${choiceCard('shape', 'record', S.shape, 'Just record it', 'Any claim, in your words. Published and pinned, but not scored.')}
  </div></section>`;
}

function stepWhat(): string {
  const ph = { binary: 'US unemployment rises above 5% by the end of 2027', choice: 'Who wins the 2030 World Cup', quantity: 'Global cross-border bank claims at the end of 2027', record: 'Anything you want on the record' }[S.shape!];
  let extra = '';
  if (S.shape === 'choice') {
    const picks: [Pick, string][] = [['one', 'Pick the winner'], ['set', 'Pick who makes it'], ['order', 'Put them in order']];
    extra = `<div class="seg" role="group" aria-label="What you are predicting">${picks.map(([v, l]) => `<button type="button" data-pick="${v}" aria-pressed="${S.pick === v}">${l}</button>`).join('')}</div>
      ${S.pick !== 'one' ? `<label class="inline">How many ${S.pick === 'set' ? 'make it' : 'are you ranking'}? <input type="number" min="1" data-bind="size" value="${S.size}" class="short"></label>` : ''}
      <ol class="options">${S.options.map((o, i) => `<li><input type="text" data-opt="${i}" value="${h(o.label)}" placeholder="Outcome ${i + 1}" aria-label="Outcome ${i + 1}">
        <button type="button" class="icon" data-move="${i}:-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" class="icon" data-move="${i}:1" aria-label="Move down"${i === S.options.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="icon" data-remove="${i}" aria-label="Remove"${S.options.length <= 2 ? ' disabled' : ''}>×</button></li>`).join('')}</ol>
      <button type="button" class="ghost" data-add>+ Add an outcome</button>
      ${S.pick === 'one' ? `<p class="hint">"${SOMETHING_ELSE}" is added for you, so the claim can resolve even if none of these happens.</p>` : ''}
      ${S.pick === 'order' ? '<p class="hint">Put them in the order you expect. Rankings are scored by where the real result lands in your order.</p>' : ''}`;
  }
  if (S.shape === 'quantity') {
    extra = `<div class="row"><label>Low <input type="number" data-bind="low" value="${h(S.low)}"></label><label>High <input type="number" data-bind="high" value="${h(S.high)}"></label><label>Unit <input type="text" data-bind="unit" value="${h(S.unit)}" placeholder="e.g. $ trillion"></label></div>`;
  }
  return `<section><h2><span>2</span>What do you think will happen?</h2>
    <label class="sr" for="statement">Your claim</label>
    <textarea id="statement" rows="2" data-bind="statement" placeholder="${h(ph)}">${h(S.statement)}</textarea>
    <p class="hint">${S.shape === 'record' ? 'Say it however you like.' : 'One sentence that a stranger could check. Name the thing, the number, the place.'}</p>
    ${extra}</section>`;
}

function compareFields(unit = ''): string {
  if (S.shape !== 'binary') return '';
  const ops: [string, string][] = [['>', 'rises above'], ['>=', 'is at least'], ['<', 'falls below'], ['<=', 'is at most']];
  return `<div class="row"><label>It <select data-set="op">${ops.map(([v, l]) => `<option value="${v}"${S.op === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>this number <input type="number" step="any" data-bind="threshold" value="${h(S.threshold)}" class="short">${unit ? ` <span class="unit">${h(unit)}</span>` : ''}</label></div>`;
}

function stepHow(): string {
  if (S.shape === 'record') return '';
  if (!S.checkable) {
    return `<section><h2><span>3</span>How will we know?</h2>
      <div class="fields quiet"><p><b>You decide</b>, when the date comes, and readers see that you did.</p>
      <label>Where to look <small class="muted">optional</small><input type="url" data-bind="evidence" value="${h(S.evidence)}" placeholder="the page that will show the answer"></label></div>
      <button type="button" class="ghost" data-checkable>Make it checkable by strangers →</button>
      <p class="hint">Point to a statistic, an official record or a blyg, and the answer can be read off the source instead of taken on your word.</p></section>`;
  }
  const kinds = `<div class="grid2">
    ${choiceCard('kind', 'blyg', S.kind, 'Blygger shows it', 'Claims, items and pins on blygs.')}
    ${choiceCard('kind', 'data_series', S.kind, 'A published statistic', 'From Our World in Data, the World Bank, the IMF, Eurostat, the WHO and others.')}
    ${choiceCard('kind', 'record', S.kind, 'An official record shows it', 'A law, a filing, a paper, a trial, a patent, a ruling.')}
    ${choiceCard('kind', 'web_data', S.kind, 'A number on a web page', 'A field in a public JSON file.')}
    ${choiceCard('kind', 'judgment', S.kind, 'Someone decides', 'People you name, or you, with evidence.')}
  </div>`;
  let fields = '';
  if (S.kind === 'blyg') {
    fields = `<label>What to look at <select data-set="blygMetric">
        <option value="blygs_with_claims"${S.blygMetric === 'blygs_with_claims' ? ' selected' : ''}>How many blygs have posted a claim</option>
        <option value="item_exists"${S.blygMetric === 'item_exists' ? ' selected' : ''}>Whether a particular item is published</option></select></label>
      ${S.blygMetric === 'item_exists' ? `<label>The item's address <input type="url" data-bind="item" value="${h(S.item)}" placeholder="https://example.com/blyg/f/…/"></label>`
        : `<label class="check"><input type="checkbox" data-toggle="excludeMine"${S.excludeMine ? ' checked' : ''}> Don't count my own blyg</label>${compareFields('blygs')}`}`;
  }
  if (S.kind === 'data_series') {
    const ind = indicator();
    const pub = PUBLISHERS[ind ? ind.provider : S.provider];
    const places = [...new Set(INDICATORS.map((x) => x.where))];
    fields = `<label>Which statistic? <select data-set="indicator">${places.map((w) => `<optgroup label="${h(w)}">${INDICATORS.map((x, i) => (x.where === w ? `<option value="${i}"${S.indicator === String(i) ? ' selected' : ''}>${h(x.name)} (${h(PUBLISHERS[x.provider].name)})</option>` : '')).join('')}</optgroup>`).join('')}
        <option value="custom"${S.indicator === 'custom' ? ' selected' : ''}>Another series, from any publisher…</option></select></label>
      ${ind ? `<p class="source"><a href="${h(ind.url)}" target="_blank" rel="noopener">Open on ${h(pub.name)} ↗</a> · ${ind.frequency} · ${h(ind.unit)}
          ${readingState === 'loading' ? ' · reading…' : reading ? ` · <b>Latest: ${h(reading.value)} (${h(reading.period)})</b>` : readingState === 'none' ? ' · open the link to see the latest value' : ''}</p>`
        : `<label>Publisher <select data-set="provider">${grouped(PUBLISHERS).map(([g, xs]) => `<optgroup label="${h(g)}">${xs.map(([k, x]) => `<option value="${k}"${S.provider === k ? ' selected' : ''}>${h(x.name)} (${h(x.covers)})</option>`).join('')}</optgroup>`).join('')}</select></label>
          <p class="source">Find the series on <a href="${h(pub.url)}" target="_blank" rel="noopener">${h(pub.name)} ↗</a>, then paste it below.</p>
          <label>Series <input type="text" data-bind="series" value="${h(S.series)}" placeholder="${h(pub.hint)}"></label>
          <label>How often is it published? <select data-set="freq">${(['monthly', 'quarterly', 'annual'] as const).map((f) => `<option value="${f}"${S.freq === f ? ' selected' : ''}>${f}</option>`).join('')}</select></label>`}
      <label>For which period? ${frequency() === 'annual'
        ? `<input type="number" min="1990" max="2100" data-bind="period" value="${h(S.period.slice(0, 4))}" placeholder="2027" class="short">`
        : `<input type="month" data-bind="period" value="${h(S.period.slice(0, 7))}">`}</label>
      ${compareFields(ind?.unit)}
      <p class="hint">The numbers are read as they were published on your date, so later revisions don't change the answer.</p>`;
  }
  if (S.kind === 'record') {
    const reg = REGISTERS[S.registry];
    fields = `<label>Where is it recorded? <select data-set="registry">${grouped(REGISTERS).map(([g, xs]) => `<optgroup label="${h(g)}">${xs.map(([k, x]) => `<option value="${k}"${S.registry === k ? ' selected' : ''}>${h(x.name)} (${h(x.covers)})</option>`).join('')}</optgroup>`).join('')}</select></label>
      ${reg?.url ? `<p class="source">Find it on <a href="${h(reg.url)}" target="_blank" rel="noopener">${h(reg.name)} ↗</a></p>` : ''}
      <label>Which record? <input type="text" data-bind="recordId" value="${h(S.recordId)}" placeholder="${h(reg?.hint ?? 'its ID or address')}"></label>
      <label>What has to appear in it? <input type="text" data-bind="event" value="${h(S.event)}" placeholder="e.g. adopted, became law, approved, granted, judgment delivered"></label>`;
  }
  if (S.kind === 'web_data') {
    fields = `<label>Address of the data <input type="url" data-bind="url" value="${h(S.url)}" placeholder="https://…/data.json"></label>
      <label>Which field? <input type="text" data-bind="pointer" value="${h(S.pointer)}" placeholder="/data/0/value"></label>
      ${compareFields()}
      <p class="hint">Web pages change without notice. The value is archived when it is read.</p>`;
  }
  if (S.kind === 'judgment') {
    fields = `<label>Who decides? <select data-set="judgeBy"><option value="author"${S.judgeBy === 'author' ? ' selected' : ''}>I do</option><option value="named"${S.judgeBy === 'named' ? ' selected' : ''}>People I name</option></select></label>
      ${S.judgeBy === 'named' ? `<label>Their blyg addresses <input type="text" data-bind="judges" value="${h(S.judges)}" placeholder="https://…/blyg/, https://…"></label>` : '<p class="hint">Readers will see that you decide your own claim.</p>'}
      <label>Where to look <input type="url" data-bind="evidence" value="${h(S.evidence)}" placeholder="optional: the page that will show it"></label>`;
  }
  return `<section><h2><span>3</span>How will we know?</h2>${kinds}${fields ? `<div class="fields">${fields}</div>` : ''}
    <button type="button" class="link" data-simple>Keep it simple: I'll decide</button></section>`;
}

function stepWhen(): string {
  const presets: [string, number][] = [['In a month', 30], ['In 6 months', 182], ['In a year', 365], ['End of next year', -1]];
  const date = (d: number) => {
    if (d < 0) return `${new Date().getUTCFullYear() + 1}-12-31`;
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + d);
    return t.toISOString().slice(0, 10);
  };
  const n = S.shape === 'record' ? 3 : 4;
  return `<section><h2><span>${n}</span>By when will we know?</h2>
    <input type="date" data-bind="resolvesBy" value="${h(S.resolvesBy)}" min="${today}" aria-label="Date">
    <div class="chips">${presets.map(([l, d]) => `<button type="button" data-date="${date(d)}">${l}</button>`).join('')}</div></section>`;
}

function stepSure(): string {
  if (S.shape === 'record') return '';
  let body = '';
  if (S.shape === 'binary') {
    body = `<div class="big"><span id="pct">${S.probability}%</span> <span id="pword">${sureWord(S.probability)}</span></div>
      <input type="range" min="5" max="95" step="5" data-bind="probability" value="${S.probability}" aria-label="How sure">`;
  }
  if (S.shape === 'choice') {
    if (S.pick === 'one' && !S.options.some((o) => o.label === SOMETHING_ELSE)) S.options.push({ label: SOMETHING_ELSE });
    const opts = S.options;
    const pctAllowed = S.pick !== 'order';
    body = pctAllowed
      ? `<label class="check"><input type="checkbox" data-toggle="rankOnly"${S.rankOnly ? ' checked' : ''}> Rank them instead of giving percentages</label>
        ${S.rankOnly ? '<p class="hint">Your order above is your forecast. Rankings are scored separately from percentages.</p>'
          : `<ul class="pcts">${opts.map((o, i) => `<li><span data-plabel="${i}">${h(o.label || `Outcome ${i + 1}`)}</span><input type="number" min="0" max="100" step="1" data-pct="${i}" value="${o.percent ?? ''}" aria-label="Percent for ${h(o.label)}"> %</li>`).join('')}</ul>
          <p class="hint" id="sum"></p>`}`
      : '<p class="hint">An order is a ranking, so there are no percentages to give. Your order above is your forecast.</p>';
  }
  if (S.shape === 'quantity') {
    body = `<div class="big"><span id="pct">${S.confidence}%</span> <span class="muted">sure the real number lands in your range</span></div>
      <input type="range" min="50" max="95" step="5" data-bind="confidence" value="${S.confidence}" aria-label="Confidence">`;
  }
  return `<section><h2><span>5</span>How sure are you?</h2>${body}</section>`;
}

function stepCancel(): string {
  const n = S.shape === 'record' ? 4 : 6;
  return `<section><h2><span>${n}</span>Anything that would cancel it? <small class="muted">optional</small></h2>
    <input type="text" data-bind="voidsIf" value="${h(S.voidsIf)}" placeholder="e.g. the tournament isn't held">
    <p class="hint">Write it now, before anyone knows the outcome. A cancelled claim isn't scored, for or against you.</p></section>`;
}

function render(): void {
  const top = conn
    ? `<span class="dot"></span>${h(conn.origin.replace(/^https?:\/\//, ''))} <button type="button" class="link" data-disconnect>Disconnect</button>`
    : `<form data-connect class="connect"><input type="text" name="blyg" placeholder="your blyg, e.g. example.com/blyg" value="${h(blygInput)}" aria-label="Your blyg's address"><button type="submit">Connect</button></form>`;
  const tabs = conn
    ? `<nav class="tabs" aria-label="Views"><button type="button" data-view="new" aria-pressed="${view === 'new'}">New claim</button><button type="button" data-view="mine" aria-pressed="${view === 'mine'}">Your claims</button></nav>`
    : '';
  app.innerHTML = `<header><div class="brand">blyg-claims</div><div class="conn">${top}</div></header>
    ${tabs}
    ${notice ? `<div class="notice ${notice.kind}" role="status">${notice.kind === 'ok' && published ? `${h(notice.text)} <a href="${h(published.url)}" target="_blank" rel="noopener">See it on your blyg ↗</a>` : h(notice.text)}</div>` : ''}
    <main>${view === 'mine' && conn ? renderMine() : `<div class="intro"><h1>Make a forecast anyone can check.</h1><p>Your claim is published and pinned on your own blyg. This page keeps nothing.</p></div>
    ${stepKind()}
    ${S.shape ? stepWhat() + stepHow() + stepWhen() + stepSure() + stepCancel() + '<div id="derived"></div>' : ''}`}
    </main>`;
  if (view === 'new') refresh();
}

function refresh(): void {
  const el = document.getElementById('derived');
  if (!el || !S.shape) return;
  const d = draft();
  const claim = toClaim(d);
  const list = problems();
  const stops = list.filter((m) => m.level === 'stop');
  const how = d.check ? resolvesBy(d.check) : null;
  const sure = S.shape === 'binary' ? `<b class="acc">${S.probability}%</b> ${sureWord(S.probability)}`
    : S.shape === 'quantity' ? `<b class="acc">${h(S.low || '?')}–${h(S.high || '?')}</b> ${h(S.unit)} · ${S.confidence}% sure`
    : S.shape === 'choice' ? (claim.outcomes ?? []).map((o, i) => `${S.rankOnly || S.pick === 'order' ? `${i + 1}. ` : ''}${h(o.label)}${o.probability !== undefined ? ` <b class="acc">${Math.round(o.probability * 100)}%</b>` : ''}`).join('<br>')
    : 'Not scored';
  el.innerHTML = `<section class="checks">${list.length ? list.map((m) => `<p class="${m.level}">${m.level === 'stop' ? 'Fix' : 'Check'}: ${h(m.message)}</p>`).join('') : `<p class="ok">${d.check && d.check.oracle === 'judgment' && d.check.by === 'author' ? 'Ready to publish. You will decide the outcome, and readers will see that you did.' : S.shape === 'record' ? 'Ready to publish. It goes on the record, unscored.' : 'Ready. A stranger could check this.'}</p>`}</section>
    <section class="preview"><div class="pcard">
      <div class="row between"><span class="label">Claim</span>${how ? `<span class="pill">${how === 'automatic' ? 'Resolves automatically' : how === 'record' ? 'Resolves from the record' : d.check && d.check.oracle === 'judgment' && d.check.by === 'author' ? 'The author decides' : 'Resolves by judgment'}</span>` : S.shape === 'record' ? '<span class="pill">On the record</span>' : ''}</div>
      <p class="stmt">${h(claim.claim) || '<span class="muted">Your claim</span>'}</p>
      <p>${sure}</p>
      <p class="muted">${claim.resolves_by ? `By ${h(claim.resolves_by)}` : 'No date yet'}${claim.criteria ? ` · ${h(claim.criteria)}` : ''}</p>
      ${claim.voids_if ? `<p class="muted">Cancelled if: ${h(claim.voids_if)}</p>` : ''}
    </div>
    <div class="actions">
      ${conn ? `<button type="button" class="primary" data-publish${stops.length || busy ? ' disabled' : ''}>${busy ? 'Publishing…' : `Publish and pin to ${h(conn.origin.replace(/^https?:\/\//, ''))}`}</button>`
        : `<p class="hint">Connect your blyg at the top to publish, or copy the block into any blyg.</p>`}
      <button type="button" data-copy${stops.length ? ' disabled' : ''}>Copy the block</button>
      <button type="button" class="link" data-json>${S.showJson ? 'Hide' : 'Show'} what gets published</button>
    </div>
    ${S.showJson ? `<pre>${h(toMarkdown(claim))}</pre>` : ''}</section>`;
  const sum = document.getElementById('sum');
  if (sum && S.shape === 'choice') {
    const opts = S.options;
    const total = opts.reduce((a, o) => a + (o.percent ?? 0), 0);
    const want = S.pick === 'set' ? S.size * 100 : 100;
    sum.textContent = `${Math.round(total)}% of ${want}%`;
    sum.className = Math.abs(total - want) < 0.5 ? 'hint ok' : 'hint';
  }
  document.querySelectorAll<HTMLElement>('[data-plabel]').forEach((el) => {
    const i = Number(el.dataset.plabel);
    el.textContent = S.options[i]?.label || `Outcome ${i + 1}`;
  });
  const pct = document.getElementById('pct');
  if (pct) pct.textContent = `${S.shape === 'quantity' ? S.confidence : S.probability}%`;
  const word = document.getElementById('pword');
  if (word) word.textContent = sureWord(S.probability);
}

async function loadReading(): Promise<void> {
  reading = null;
  const ind = indicator();
  if (S.kind !== 'data_series' || !ind) {
    readingState = 'idle';
    return;
  }
  readingState = 'loading';
  render();
  reading = await latest(ind.provider, ind.series);
  readingState = reading ? 'ok' : 'none';
  render();
}


// ---------- your claims ----------

const STATUS_LABEL: Record<string, string> = { due: 'Due', open: 'Open', resolved: 'Resolved', void: "Couldn't be decided", record: 'On the record' };

function forecastLine(c: MyClaim['claim']): string {
  const shape = shapeOf(c);
  if (shape === 'binary') return `<b class="acc">${Math.round((c.probability ?? 0) * 100)}%</b>`;
  if (shape === 'quantity') return `<b class="acc">${h(c.range?.[0])}–${h(c.range?.[1])}</b> ${h(c.unit ?? '')}`;
  if (shape === 'choice') return (c.outcomes ?? []).slice(0, 4).map((o) => `${h(o.label)}${o.probability !== undefined ? ` ${Math.round(o.probability * 100)}%` : ''}`).join(' · ');
  return '';
}

function resolvePanel(m: MyClaim): string {
  const c = m.claim;
  const shape = shapeOf(c);
  let choices = '';
  if (shape === 'binary') {
    choices = `<div class="seg" role="group" aria-label="What happened">${(['yes', 'no', 'void'] as const).map((v) => `<button type="button" data-r-choice="${v}" aria-pressed="${R.choice === v}">${v === 'yes' ? 'Yes' : v === 'no' ? 'No' : "Can't tell"}</button>`).join('')}</div>`;
  } else if (shape === 'choice') {
    const many = c.pick !== 'one';
    choices = `<p class="hint">${many ? `Choose the ${c.size} that ${c.pick === 'order' ? 'finished on top, in order (tap in order)' : 'made it'}.` : 'Choose what happened.'}</p>
      <div class="chips">${(c.outcomes ?? []).map((o) => { const i = R.labels.indexOf(o.label); return `<button type="button" data-r-label="${h(o.label)}" aria-pressed="${i >= 0}">${i >= 0 && c.pick === 'order' ? `${i + 1}. ` : ''}${h(o.label)}</button>`; }).join('')}
      <button type="button" data-r-choice="void" aria-pressed="${R.choice === 'void'}">Can't tell</button></div>`;
  } else if (shape === 'quantity') {
    choices = `<label>The real number <input type="number" step="any" data-r="value" value="${h(R.value)}" class="short"> ${h(c.unit ?? '')}</label>
      <button type="button" class="link" data-r-choice="void">Can't tell</button>`;
  }
  const isVoid = R.choice === 'void';
  return `<div class="fields resolve">
    ${choices}
    ${isVoid ? `<label>Why can't it be decided? <input type="text" data-r="note" value="${h(R.note)}" placeholder="${h(c.voids_if ? `e.g. ${c.voids_if}` : 'e.g. the source stopped publishing')}"></label>${c.voids_if ? `<p class="hint">You wrote that it is cancelled if: ${h(c.voids_if)}</p>` : ''}`
      : `<label>Evidence <input type="url" data-r="evidence" value="${h(R.evidence)}" placeholder="a link that shows the outcome"></label>`}
    ${c.check && 'evidence' in c.check && c.check.evidence ? `<p class="hint">You said to look at <a href="${h(c.check.evidence)}" target="_blank" rel="noopener">${h(c.check.evidence)}</a></p>` : ''}
    <p class="hint" id="r-problems"></p>
    <div class="actions"><button type="button" class="primary" data-r-publish>${busy ? 'Publishing…' : 'Publish resolution'}</button><button type="button" class="link" data-r-cancel>Cancel</button></div>
    <p class="hint">Your answer is added to the claim as a new version and pinned. The claim itself stays exactly as you wrote it.</p>
  </div>`;
}

function renderMine(): string {
  if (mineState === 'loading' || mine === null) return '<p class="loading">Reading your claims…</p>';
  if (mineState === 'error') return '<p class="notice error">Could not read your blyg\'s claims. Reload to try again.</p>';
  if (!mine.length) return '<p class="hint">No claims on your blyg yet. Make one under New claim.</p>';
  const groups: [string, MyClaim[]][] = [['Due', mine.filter((m) => m.status === 'due')], ['Open', mine.filter((m) => m.status === 'open')], ['Resolved', mine.filter((m) => m.status === 'resolved' || m.status === 'void')], ['On the record', mine.filter((m) => m.status === 'record')]];
  return groups.filter(([, xs]) => xs.length).map(([title, xs]) => `<section><h2 class="plain">${title} <small class="muted">${xs.length}</small></h2>
    ${xs.map((m) => `<article class="pcard mine">
      <div class="row between"><span class="label">${STATUS_LABEL[m.status]}</span><span class="muted small">by ${h(m.claim.resolves_by)}</span></div>
      <p class="stmt">${h(m.claim.claim ?? '(no statement)')}</p>
      <p>${forecastLine(m.claim)}${m.resolution ? ` · <b>${h(describeOutcome(m.resolution))}</b>` : ''}</p>
      <p class="small"><a href="${h(m.url)}" target="_blank" rel="noopener">Open on your blyg ↗</a></p>
      ${m.status === 'due' || m.status === 'open' ? (R.id === m.id ? resolvePanel(m) : `<button type="button" ${m.status === 'due' ? 'class="primary"' : ''} data-r-start="${h(m.id)}">${m.status === 'due' ? 'Resolve' : 'Resolve early'}</button>`) : ''}
    </article>`).join('')}</section>`).join('');
}

async function loadMine(): Promise<void> {
  if (!conn) return;
  mineState = 'loading';
  render();
  try {
    mine = await listClaims(conn.origin, today);
    mineState = 'idle';
  } catch {
    mineState = 'error';
  }
  render();
}

function answer(m: MyClaim): Answer | null {
  const shape = shapeOf(m.claim);
  if (R.choice === 'void') return { kind: 'void', note: R.note };
  if (shape === 'binary') return R.choice ? { kind: 'binary', outcome: R.choice === 'yes' } : null;
  if (shape === 'choice') return R.labels.length ? { kind: 'choice', labels: R.labels } : null;
  if (shape === 'quantity') return R.value.trim() ? { kind: 'quantity', value: Number(R.value) } : null;
  return null;
}

function rProblems(): string[] {
  const m = mine?.find((x) => x.id === R.id);
  if (!m) return [];
  const a = answer(m);
  return a ? checkAnswer(m.claim, a, R.evidence) : ['Choose what happened.'];
}

// ---------- events ----------

function setOption(i: number, label: string): void {
  S.options[i] = { ...S.options[i], label };
}

app.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.r) {
    (R as Record<string, unknown>)[t.dataset.r] = t.value;
    const el = document.getElementById('r-problems');
    if (el) el.textContent = '';
    return;
  }
  if (t.dataset.bind) {
    const k = t.dataset.bind as keyof typeof S;
    (S as Record<string, unknown>)[k] = ['probability', 'confidence', 'size'].includes(k) ? Number(t.value) : t.value;
    if (k === 'size') return void render();
  } else if (t.dataset.opt !== undefined) setOption(Number(t.dataset.opt), t.value);
  else if (t.dataset.pct !== undefined) {
    const i = Number(t.dataset.pct);
    if (S.options[i]) S.options[i] = { ...S.options[i], percent: num(t.value) };
  } else return;
  refresh();
});

app.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.set) {
    (S as Record<string, unknown>)[t.dataset.set] = t.value;
    if (t.dataset.set === 'indicator' || t.dataset.set === 'kind' || t.dataset.set === 'freq') {
      S.period = '';
      void loadReading();
    }
    render();
  } else if (t.dataset.toggle) {
    (S as Record<string, unknown>)[t.dataset.toggle] = t.checked;
    render();
  }
});

app.addEventListener('click', async (e) => {
  const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.view) {
    view = d.view as 'new' | 'mine';
    notice = null;
    if (view === 'mine' && mine === null) return void loadMine();
    return render();
  }
  if (d.rStart) {
    Object.assign(R, { id: d.rStart, choice: '', labels: [], value: '', evidence: '', note: '' });
    return render();
  }
  if (d.rCancel !== undefined) {
    R.id = '';
    return render();
  }
  if (d.rChoice) {
    R.choice = d.rChoice as typeof R.choice;
    if (R.choice === 'void') R.labels = [];
    return render();
  }
  if (d.rLabel !== undefined) {
    const m = mine?.find((x) => x.id === R.id);
    const label = d.rLabel;
    R.choice = '';
    if (m?.claim.pick === 'one') R.labels = [label];
    else R.labels = R.labels.includes(label) ? R.labels.filter((l) => l !== label) : [...R.labels, label];
    return render();
  }
  if (d.rPublish !== undefined && conn) {
    const m = mine?.find((x) => x.id === R.id);
    const problems = rProblems();
    if (!m || problems.length) {
      const el = document.getElementById('r-problems');
      if (el) el.textContent = problems.join(' ');
      return;
    }
    if (!canRead(conn)) {
      notice = { kind: 'error', text: 'Resolving needs permission to read your drafts, which this connection does not have yet. Disconnect, connect again and allow access.' };
      return render();
    }
    busy = true;
    render();
    try {
      published = await resolveClaim(conn, m.id, toResolution(answer(m)!, R.evidence, today, R.note));
      notice = { kind: 'ok', text: 'Resolved and pinned.' };
      R.id = '';
      mine = null;
      busy = false;
      return void loadMine();
    } catch (err) {
      notice = { kind: 'error', text: err instanceof Error ? err.message : String(err) };
    }
    busy = false;
    return render();
  }
  if (d.pick) {
    S.pick = d.pick as Pick;
    if (S.pick === 'order') S.rankOnly = true;
    render();
  } else if (d.add !== undefined) {
    S.options.push({ label: '' });
    render();
  } else if (d.remove) {
    S.options.splice(Number(d.remove), 1);
    render();
  } else if (d.move) {
    const [i, step] = d.move.split(':').map(Number);
    const [x] = S.options.splice(i, 1);
    S.options.splice(i + step, 0, x);
    render();
  } else if (d.date) {
    S.resolvesBy = d.date;
    render();
  } else if (d.checkable !== undefined) {
    S.checkable = true;
    S.kind = null;
    render();
  } else if (d.simple !== undefined) {
    S.checkable = false;
    S.kind = 'judgment';
    S.judgeBy = 'author';
    reading = null;
    render();
  } else if (d.json !== undefined) {
    S.showJson = !S.showJson;
    refresh();
  } else if (d.disconnect !== undefined) {
    disconnect();
    conn = null;
    render();
  } else if (d.copy !== undefined) {
    const text = toMarkdown(toClaim(draft()));
    try {
      await navigator.clipboard.writeText(text);
      notice = { kind: 'ok', text: 'Copied. Paste it into a new item on any blyg, publish, and pin that version.' };
    } catch {
      S.showJson = true;
      notice = { kind: 'error', text: 'Your browser blocked copying. Select the text under "what gets published" and copy it.' };
    }
    published = null;
    render();
  } else if (d.publish !== undefined && conn) {
    busy = true;
    refresh();
    try {
      published = await publishClaim(conn, toMarkdown(toClaim(draft())));
      notice = { kind: 'ok', text: 'Published and pinned.' };
      mine = null;
    } catch (err) {
      notice = { kind: 'error', text: err instanceof Error ? err.message : String(err) };
      if (/expired/.test(notice.text)) {
        disconnect();
        conn = null;
      }
    }
    busy = false;
    render();
  }
});

app.addEventListener('submit', async (e) => {
  const form = e.target as HTMLFormElement;
  if (!form.matches('[data-connect]')) return;
  e.preventDefault();
  blygInput = (form.elements.namedItem('blyg') as HTMLInputElement).value;
  try {
    const origin = await findBlyg(blygInput);
    await connect(origin, S);
  } catch (err) {
    notice = { kind: 'error', text: err instanceof Error ? err.message : String(err) };
    render();
  }
});

// ---------- start ----------

finishConnect()
  .then((back) => {
    if (back) {
      conn = back.connection;
      if (back.keep && typeof back.keep === 'object') Object.assign(S, back.keep);
      notice = { kind: 'ok', text: `Connected to ${conn.origin.replace(/^https?:\/\//, '')}.${S.shape ? ' Your claim is as you left it.' : ''}` };
    }
  })
  .catch((err) => {
    notice = { kind: 'error', text: err instanceof Error ? err.message : String(err) };
  })
  .finally(() => {
    render();
    if (S.kind === 'data_series') void loadReading();
  });

