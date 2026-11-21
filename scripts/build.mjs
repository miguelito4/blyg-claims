// Build the composer into _site/ for GitHub Pages: strip TypeScript types with
// Node's own stripper (no dependencies), point imports at .js, copy the page.
import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

// Every deploy gets its own version, added to each script and stylesheet
// address, so browsers never mix a cached old module with a new page.
const VERSION = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return Date.now().toString(36);
  }
})();

const OUT = '_site';
// The composer lives at /app/. /new/ and the site root send people there
// until the landing page exists; /new/ is the address to share.
const APP = join(OUT, 'app');
const SOURCES = ['web', 'extension/ui/core'];

await rm(OUT, { recursive: true, force: true });
for (const dir of SOURCES) {
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.ts')) continue;
    const ts = await readFile(join(dir, name), 'utf8');
    const js = stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/(from\s+['"][^'"]+)\.ts(['"])/g, `$1.js?v=${VERSION}$2`);
    const out = join(APP, dir, name.replace(/\.ts$/, '.js'));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, js);
  }
}
// Icons and link previews. Every page people share gets its own title,
// description and image; crawlers don't follow the /new/ and /record/
// redirects, so those pages carry the tags too.
const SITE = 'https://blyggi.com';
const PAGES = {
  home: { path: '/', title: 'Blyggi: say it, pin it, get scored', desc: 'Make a forecast anyone can check, pinned on your own blyg. Your track record builds in public, claim by claim.', image: 'og-home.png' },
  new: { path: '/new/', title: 'Make a claim · Blyggi', desc: 'Write a forecast in plain words. Blyggi makes it checkable, then publishes and pins it on your own blyg.', image: 'og-new.png' },
  explore: { path: '/explore/', title: 'Explore claims · Blyggi', desc: 'Every forecast pinned on a public blyg: what people said, how sure they were, when it comes due and how it turned out.', image: 'og-explore.png' },
  record: { path: '/record/', title: 'Track record · Blyggi', desc: 'Every pinned claim on a blyg, scored when it resolves. Read from public files, so anyone can check it.', image: 'og-record.png' },
};
const esc = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const head = (key, theme = '#D4FF3A') => {
  const p = PAGES[key];
  return [
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" href="/brand/icon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    `<meta name="theme-color" content="${theme}">`,
    `<link rel="canonical" href="${SITE}${p.path}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Blyggi">`,
    `<meta property="og:url" content="${SITE}${p.path}">`,
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.desc)}">`,
    `<meta property="og:image" content="${SITE}/brand/${p.image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(p.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.desc)}">`,
    `<meta name="twitter:image" content="${SITE}/brand/${p.image}">`,
  ].join('\n');
};
// Drop whatever a page already says about these, then add the shared set.
const withHead = (html, key, theme) => html
  .replace(/^<meta (property="og:[^"]*"|name="(theme-color|twitter:[^"]*)")[^>]*>\n?/gm, '')
  .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(PAGES[key].desc)}">`)
  .replace('</head>', `${head(key, theme)}\n</head>`);

const html = (await readFile('web/index.html', 'utf8')).replace('./web/app.js', `./web/app.js?v=${VERSION}`).replace('./style.css', `./style.css?v=${VERSION}`);
await writeFile(join(APP, 'index.html'), withHead(html, 'new', '#0B0B0A'));
await copyFile('web/style.css', join(APP, 'style.css'));
await writeFile(join(OUT, 'index.html'), withHead(await readFile('web/landing.html', 'utf8'), 'home'));
await mkdir(join(OUT, 'explore'), { recursive: true });
await writeFile(join(OUT, 'explore', 'index.html'), withHead(await readFile('web/explore.html', 'utf8'), 'explore', '#0B0B0A'));
const forward = (key, to) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(PAGES[key].title)}</title>
<meta name="description" content="${esc(PAGES[key].desc)}">
${head(key, '#0B0B0A')}
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace('${to}' + location.search + location.hash)</script>
</head>
<body><a href="${to}">${esc(PAGES[key].title)}</a></body>
</html>`;
for (const key of ['new', 'record']) {
  await mkdir(join(OUT, key), { recursive: true });
  await writeFile(join(OUT, key, 'index.html'), forward(key, '/app/'));
}
await mkdir(join(OUT, 'brand'), { recursive: true });
for (const name of await readdir('web/brand')) await copyFile(join('web/brand', name), join(OUT, 'brand', name));
await copyFile('web/favicon.ico', join(OUT, 'favicon.ico'));
await writeFile(join(OUT, 'site.webmanifest'), JSON.stringify({
  name: 'Blyggi',
  short_name: 'Blyggi',
  description: PAGES.home.desc,
  start_url: '/new/',
  display: 'standalone',
  background_color: '#0B0B0A',
  theme_color: '#D4FF3A',
  icons: [
    { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/brand/icon.svg', sizes: 'any', type: 'image/svg+xml' },
  ],
}, null, 1));
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`built ${OUT}/ (version ${VERSION})`);
