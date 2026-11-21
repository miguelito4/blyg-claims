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
const SOURCES = ['web', 'extension/ui/core'];

await rm(OUT, { recursive: true, force: true });
for (const dir of SOURCES) {
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.ts')) continue;
    const ts = await readFile(join(dir, name), 'utf8');
    const js = stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/(from\s+['"][^'"]+)\.ts(['"])/g, `$1.js?v=${VERSION}$2`);
    const out = join(OUT, dir, name.replace(/\.ts$/, '.js'));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, js);
  }
}
const html = (await readFile('web/index.html', 'utf8')).replace('./web/app.js', `./web/app.js?v=${VERSION}`).replace('./style.css', `./style.css?v=${VERSION}`);
await writeFile(join(OUT, 'index.html'), html);
await copyFile('web/style.css', join(OUT, 'style.css'));
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`built ${OUT}/ (version ${VERSION})`);
