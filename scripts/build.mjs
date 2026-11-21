// Build the composer into _site/ for GitHub Pages: strip TypeScript types with
// Node's own stripper (no dependencies), point imports at .js, copy the page.
import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OUT = '_site';
const SOURCES = ['web', 'extension/ui/core'];

await rm(OUT, { recursive: true, force: true });
for (const dir of SOURCES) {
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.ts')) continue;
    const ts = await readFile(join(dir, name), 'utf8');
    const js = stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2');
    const out = join(OUT, dir, name.replace(/\.ts$/, '.js'));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, js);
  }
}
await copyFile('web/index.html', join(OUT, 'index.html'));
await copyFile('web/style.css', join(OUT, 'style.css'));
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`built ${OUT}/`);
