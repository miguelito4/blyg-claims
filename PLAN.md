# Plan

Hackathon window: kickoff Friday, November 20, 17:00 UTC → end of Friday, November 27, Pacific time. Only commits on `main` in that window count; merge commits and bots don't.

## Goal for the week

A scorer anyone can run against any blyg, proven on caseyjr.org/blyg's live claims, with a write-up posted to blygger-spec#10. The Studio extension is a stretch goal.

## Design decisions to settle on day one

1. **Fence names.** Use `claim` and `resolution`. Also accept a ```` ```json ```` block that has both `probability` and `resolves_by`, so the claims already live on caseyjr.org/blyg parse without being edited.
2. **Claim fields.** Required: `probability` (a number strictly between 0 and 1) and `resolves_by` (an ISO date). Recommended: `criteria` (a string). Optional: `provenance` (a URL or a string), `tags`, and `commit` (stretch: `sha256:` of salt + text).
3. **Resolution fields.** Required: `outcome` (`true`, `false` or `"void"`). Recommended: `evidence` (URLs). Optional: `resolved_at` and `note`.
4. **When a claim was made.** The `at` of the first changelog entry whose version carries the claim block. That date is *verified* if that version is pinned and its pin's `content_hash` matches. Otherwise it is *asserted*, and the claim is scored but flagged.
5. **Statuses.** `open`, `due` (≤30 days), `overdue`, `resolved`, `void`, `withdrawn-open`, `withdrawn-resolved`.
6. **Scoring.** Brier and log score over resolved, non-void claims. Calibration in 10 buckets, each with its count. Overdue claims are reported, never scored silently: show the score with them counted as misses and without them.
7. **Revisions.** Score the earliest verifiable `probability`. List any later changes.

## Repo layout

```
schema/claim.schema.json
schema/resolution.schema.json
src/fetch.ts      blyg.json → items/index.json → items/{id}.json → pins, with an on-disk cache
src/parse.ts      content_md → claim / resolution blocks
src/claims.ts     item history → Claim records with status and dating
src/score.ts      Brier, log, calibration
src/report.ts     JSON → a static HTML page (no web fonts, inline SVG chart)
src/cli.ts        blyg-claims score <url...> [--out dir] [--json]
test/fixtures/    item documents captured from real blygs, plus synthetic edge cases
extension/ui/     a browser-only Studio extension (stretch goal)
```

TypeScript run directly by Node 22 (`--experimental-strip-types`). No runtime dependencies. Tests use `node --test`.

## Day by day

| Day | Target |
| --- | --- |
| Fri 20 | Kickoff. Commit the schemas, then the parser and its fixtures (the two live claims, plus edge cases: no block, bad JSON, two blocks, `json` fence). |
| Sat 21 | Fetcher: manifest, index, item documents, pins, cache, polite pacing (spec §12.3). Run it against caseyjr.org/blyg. |
| Sun 22 | `claims.ts`: dating from the changelog, pin verification, statuses, revisions, withdrawals. |
| Mon 23 | `score.ts` and the CLI with JSON output. Golden tests. |
| Tue 24 | HTML report with the calibration chart and the open, overdue and resolved lists. Publish the caseyjr.org report to GitHub Pages. |
| Wed 25 | Multiple blygs and third-party resolutions (responses that stub or link a claim). Start the extension spike (see below). |
| Thu 26 | Thanksgiving: a light day. Docs, and the CONTRIBUTING notes for posting claims. |
| Fri 27 | Commit-reveal if there's time. Tag v0.1.0. Post on the blyg, in #psychohistory and on blygger-spec#10. |

## Studio extension (stretch goal)

- Vendored extensions are **browser-only** and need a **source build** of Studio (`npm run ext:add`, then `npm run build`). caseyjr-blyg is a Worker-archive install, so it can't vendor anything as it stands. Develop against a local source clone with `wrangler dev`, and decide later whether the live node moves to a source build.
- Slots to use: `entryByline` (a badge on items that carry a claim: p, due date, status), `entryActions` → `openSheet` (the claim card), and possibly `draftCounter` (check the claim block while writing).
- Day-one check: can an extension add a version to an existing item through `client` (resolving a claim), or only open a new draft? Read `src/ui/extension-api.ts` and Venkat's `vgururao/newnature` mod before writing anything.

## Commit habits

Small commits, straight to `main`, each one working. One idea per commit: a schema, a parser case, a test, a doc section. No code is written before kickoff; this file and the README are the only things committed before then.
