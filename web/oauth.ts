// Connect to a blyg's Studio with OAuth 2.1: discovery, dynamic registration
// of a public client (no secret), PKCE, and the code exchange. The page keeps
// a one-hour token in sessionStorage and nothing else; the claims live on the
// blyg.

const SCOPE = 'owner:read owner:draft owner:publish';
const CLIENT_NAME = 'blyg-claims';

export interface Connection {
  origin: string;
  token: string;
  expiresAt: number;
  /** Granted scopes, space-separated. Older connections may lack it. */
  scope?: string;
}

/** Whether this connection can read drafts, which resolving needs. */
export function canRead(c: Connection): boolean {
  return (c.scope ?? '').split(' ').includes('owner:read');
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
}

const store = {
  get(area: Storage | undefined, key: string): unknown {
    try {
      const v = area?.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set(area: Storage | undefined, key: string, value: unknown): void {
    try {
      area?.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: the flow still works within one page load */
    }
  },
  del(area: Storage | undefined, key: string): void {
    try {
      area?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

export function redirectUri(): string {
  return location.origin + location.pathname;
}

/** "caseyjr.org/blyg" → "https://caseyjr.org/blyg/" after checking it is a blyg. */
export async function findBlyg(input: string): Promise<string> {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const u = new URL(raw);
  u.search = '';
  u.hash = '';
  if (u.pathname.endsWith('/blyg.json')) u.pathname = u.pathname.slice(0, -'blyg.json'.length);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  const candidates = [...new Set([u.href, `${u.origin}/blyg/`, `${u.origin}/`])];
  for (const origin of candidates) {
    try {
      const res = await fetch(`${origin}blyg.json`);
      if (res.ok && typeof (await res.json()).blyg === 'string') return origin;
    } catch {
      /* try the next */
    }
  }
  throw new Error(`No blyg found at ${input}. Check the address: it's the one readers use, such as example.com/blyg.`);
}

async function discover(origin: string): Promise<Discovery> {
  const res = await fetch(`${origin}studio/auth/.well-known/openid-configuration`);
  if (!res.ok) throw new Error('This blyg does not run Blygger Studio with sign-in for apps (Studio 0.28 or later). You can still copy the block and paste it into a new item.');
  return res.json();
}

async function clientId(origin: string, d: Discovery): Promise<string> {
  const key = `blyg-claims:client:${origin}`;
  const saved = store.get(local(), key) as { id: string; redirect: string } | null;
  if (saved && saved.redirect === redirectUri()) return saved.id;
  const res = await fetch(d.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri()],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`Your Studio refused to register this app (${res.status}). ${await res.text()}`);
  const id = (await res.json()).client_id as string;
  store.set(local(), key, { id, redirect: redirectUri() });
  return id;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Sends the browser to the blyg's consent page. `keep` is restored after the redirect. */
export async function connect(origin: string, keep: unknown): Promise<never> {
  const d = await discover(origin);
  const id = await clientId(origin, d);
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  store.set(session(), 'blyg-claims:pending', { origin, verifier, state, id, token_endpoint: d.token_endpoint, keep });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: `${origin}api`,
  });
  location.assign(`${d.authorization_endpoint}?${q}`);
  return new Promise<never>(() => {});
}

/** On return from the consent page: finish the exchange. Returns what was kept, if anything. */
export async function finishConnect(): Promise<{ connection: Connection; keep: unknown } | null> {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return null;
  const pending = store.get(session(), 'blyg-claims:pending') as
    | { origin: string; verifier: string; state: string; id: string; token_endpoint: string; keep: unknown }
    | null;
  store.del(session(), 'blyg-claims:pending');
  history.replaceState(null, '', redirectUri());
  if (params.has('error')) throw new Error(params.get('error_description') ?? 'You declined, so nothing was connected.');
  if (!pending || pending.state !== params.get('state')) throw new Error('That sign-in did not start here. Press Connect again.');
  const res = await fetch(pending.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.get('code') ?? '',
      redirect_uri: redirectUri(),
      client_id: pending.id,
      code_verifier: pending.verifier,
      resource: `${pending.origin}api`,
    }),
  });
  if (!res.ok) throw new Error(`Your Studio would not issue access (${res.status}). ${await res.text()}`);
  const t = await res.json();
  const connection = { origin: pending.origin, token: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000, scope: typeof t.scope === 'string' ? t.scope : SCOPE };
  store.set(session(), 'blyg-claims:connection', connection);
  return { connection, keep: pending.keep };
}

export function savedConnection(): Connection | null {
  const c = store.get(session(), 'blyg-claims:connection') as Connection | null;
  return c && c.expiresAt > Date.now() + 60_000 ? c : null;
}

export function disconnect(): void {
  store.del(session(), 'blyg-claims:connection');
}
