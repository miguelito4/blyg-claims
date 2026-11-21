# claims: a Studio extension

A claim bar for [Blygger Studio](https://github.com/blygger/blygger-studio)'s composer and full editor. **+ claim** opens a form that asks plain questions (what will happen, how sure, by when, how anyone will check) and inserts a `claim` block, the format [blyggi.com](https://blyggi.com) reads and scores. Select a sentence first and it becomes the claim's statement; the block goes after that paragraph. With a claim already in the post, the bar shows it in a few words (`65% · by Nov 29, 2026`) and **edit claim** opens it again.

Kinds of claim: yes or no, pick one, which make it, a ranking, a number (a range with a confidence), or just for the record. Ways to check: published data (Our World in Data, the World Bank, FRED, the ECB and others), an official record (legislatures, company and court registers, trial and patent registries), a web page, named people, or the author. The same mistake checks as blyggi.com run as you type: a date already past, percentages that don't add up, a vague word, a data release that lands after your date.

Browser only. It reads nothing but the editor's text, makes no network requests, and writes only through the bar's own insert and replace. Pinning stays the author's step: publish, then pin that version so the claim counts.

## Install

The extension API has no stability promise; this was built and tested against Studio 0.68.0.

```sh
# in your Studio source checkout
npm run ext:add -- https://github.com/miguelito4/blyg-claims.git <full commit id> --path extension
npm run build   # or deploy
```

Then turn on **Claims** in Settings → extensions. Use a full commit id from this repository's `main`. `ext:add` prints the tree hash; compare it with the one given in the release notes.

A Studio installed from a release download can't carry vendored code (see Studio's `docs/extension-vendoring.md`). Until the extension ships with Studio, [blyggi.com/new](https://blyggi.com/new/) does the same job for any Studio node over OAuth.

## Layout

```
extension/
  ui/index.tsx        the extension: the bar
  ui/claim-sheet.tsx  the form
  ui/blocks.ts        finding and placing the block in the text
  ui/claims.css       styles, on the Studio's own theme variables
  ui/core/            the parser, checks, scoring and source lists shared with blyggi.com and the CLI
```

Tests for `ui/blocks.ts` and `ui/core/` live in the repository's `test/` directory, outside the vendored path, as Studio requires.
