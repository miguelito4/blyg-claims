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
const html = (await readFile('web/index.html', 'utf8')).replace('./web/app.js', `./web/app.js?v=${VERSION}`).replace('./style.css', `./style.css?v=${VERSION}`);
await writeFile(join(APP, 'index.html'), html);
await copyFile('web/style.css', join(APP, 'style.css'));
const forward = (to) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Blyggi</title><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}"><script>location.replace('${to}' + location.search + location.hash)</script></head><body><a href="${to}">Blyggi</a></body></html>`;
await writeFile(join(OUT, 'index.html'), await readFile('web/landing.html', 'utf8'));
await mkdir(join(OUT, 'explore'), { recursive: true });
await writeFile(join(OUT, 'explore', 'index.html'), await readFile('web/explore.html', 'utf8'));
for (const [dir, to] of [['new', '/app/'], ['record', '/app/']]) {
  await mkdir(join(OUT, dir), { recursive: true });
  await writeFile(join(OUT, dir, 'index.html'), forward(to));
}
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`built ${OUT}/ (version ${VERSION})`);
