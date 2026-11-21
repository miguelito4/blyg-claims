# claims: a Studio extension

Forecasts anyone can check, inside [Blygger Studio](https://github.com/blygger/blygger-studio). It writes and reads `claim` and `resolution` blocks, the format [blyggi.com](https://blyggi.com) and this repository's CLI score.

- **Claim bar** (composer and full editor). **+ claim** opens a form that asks plain questions (what will happen, how sure, by when, how anyone will check) and inserts the block after the current paragraph. Select a sentence first and it becomes the statement. With a claim in the post, the bar shows it in a few words (`65% · by Nov 29, 2026`) and **edit claim** reopens it.
- **Byline badge** (reading view), on your posts and on blygs you follow: how sure, when it's due, ◆ pinned or ◇ not. It opens the claim: what checks it, the outcome once resolved, and on your own posts **Pin version N**.
- **Resolve** (from the badge, the ⋯ sheet or the Claims page). Choose what happened and link the evidence; the extension appends a `resolution` block, publishes and pins. If the claim was never pinned, it pins the claim's version first so the claim keeps its own date. It refuses while the post has unpublished edits, so they don't ship with the resolution.
- **Forecast this too**, on someone else's claim: opens a draft with a copy of the claim and a link to theirs, ready to change with **edit claim**.
- **Claims page** (under More): your claims as due, open, resolved and on the record, with your Brier score, ranking and range results. Each is scored on the claim as first pinned, the rule any reader of your public files uses, so this page and your public track record agree.

Kinds of claim: yes or no, pick one, which make it, a ranking, a number (a range with a confidence), or just for the record. Ways to check: published data (Our World in Data, the World Bank, FRED, the ECB and others), an official record (legislatures, company and court registers, trial and patent registries), a web page, named people, or the author. The form runs the same mistake checks as blyggi.com.

Browser only, with no network requests of its own. It reads claims from entries' HTML and your own items through the SDK. It writes only through the editor bar and, when you press pin or publish resolution, through `updateItem`, `publishItem` and `pinItem` on that one item.

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
  ui/index.tsx        the extension and the editor bar
  ui/claim-sheet.tsx  the claim form
  ui/reading.tsx      the byline badge, the claim sheet, pinning and resolving
  ui/page.tsx         the Claims page
  ui/blocks.ts        finding and placing blocks in text, and reading them from HTML
  ui/claims.css       styles, on the Studio's own theme variables
  ui/core/            the parser, checks, scoring and source lists shared with blyggi.com and the CLI
```

Tests for `ui/blocks.ts` and `ui/core/` live in the repository's `test/` directory, outside the vendored path, as Studio requires.
