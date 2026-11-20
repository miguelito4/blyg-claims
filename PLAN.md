# Plan

Hackathon window: kickoff Friday, November 20, 17:00 UTC → end of Friday, November 27, Pacific time. Only commits on `main` in that window count; merge commits and bots don't.

## Goal for the week

A scorer anyone can run against any blyg, proven on caseyjr.org/blyg's live claims, with a write-up posted to blygger-spec#10. The Studio extension is a stretch goal.

## Design decisions to settle on day one

1. **Fence names.** New claims use `claim` and `resolution`. A block in a `json` or unlabeled fence also counts if its JSON has both `probability` and `resolves_by`: the two live claims on caseyjr.org/blyg use exactly those fences, and they parse unedited.
2. **Claim fields.** Required: `probability` (a number strictly between 0 and 1) and `resolves_by` (an ISO date). Recommended: `claim` (the statement) and `criteria`. Optional: `provenance` (a URL or a string), `discussion` (a URL), `tags`, and `commit` (stretch: `sha256:` of salt + text). Later: an optional machine-checkable `check` (series, threshold, fallback).
3. **Resolution fields.** Required: `outcome` (`true`, `false` or `"void"`). Recommended: `evidence` (URLs). Optional: `resolved_at` and `note`.
4. **When a claim was made.** The `at` of the first changelog entry whose version carries the claim block. That date is *verified* if that version is pinned and its pin's `content_hash` matches. Otherwise it is *asserted*, and the claim is scored but flagged.
5. **Statuses.** `open`, `due` (≤30 days), `overdue`, `resolved`, `void`, `withdrawn-open`, `withdrawn-resolved`.
6. **Scoring.** Brier and log score over resolved, non-void claims. Calibration in 10 buckets, each with its count. Overdue claims are reported, never scored silently: show the score with them counted as misses and without them.
7. **Revisions.** Compare the claim block only: a version revises the claim when `claim`, `probability`, `resolves_by` or `criteria` changes. Edits to prose, links or transclusions don't count (12cq260v… v2 fixed a transclusion and left the block alone). Score the earliest verifiable block and list later changes.
8. **The block is the source of truth.** Prose that restates a number ("Probability: 0.85") is ignored, but a mismatch with the block is reported as a warning.
9. **Claims can be threads.** `content_md` is read the same way for both kinds.

## Repo layout

```
schema/claim.schema.json
schema/resolution.schema.json
extension/ui/core/   pure, dependency-free TypeScript shared by the CLI and the extension
  parse.ts           content_md → claim / resolution blocks
  claims.ts          item history → Claim records with status, dating and revisions
  score.ts           Brier, log, calibration
extension/ui/        the browser-only Studio extension (stretch goal), vendorable as-is
src/fetch.ts         blyg.json → items/index.json → items/{id}.json → pins, with an on-disk cache
src/report.ts        JSON → a static HTML page (no web fonts, inline SVG chart)
src/cli.ts           blyg-claims score <url...> [--out dir] [--json]
test/                node --test suites and fixtures (outside extension/, as vendoring requires)
```

The core lives under `extension/ui/core/` because a vendored extension may import only files in its own `ui/` directory. The CLI imports the core from there, so one implementation serves both.

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

## Composer (the headline, decided 2026-11-20)

A fenced JSON block is a format for developers. The job for everyone else: turn a hunch into a forecast a stranger can check, without knowing a format exists. So the week's headline is a **static web composer that stores nothing**: it publishes and pins claims into the user's own blyg through Studio's OAuth, and reads anyone's track record from public files. Delete the page and every claim is still on the protocol.

Checked against caseyjr.org/blyg (Studio 0.62), without registering anything:

- Discovery: `{mount}/studio/auth/.well-known/openid-configuration`. Issuer `{mount}/studio/auth`; registration at `{mount}/studio/auth/oauth2/register`.
- `token_endpoint_auth_methods_supported` includes `none`, and PKCE `S256` is supported: a browser client with no secret is allowed.
- CORS answers `*` on the registration and token endpoints and on `{mount}/api` (with `Authorization`): a page on another origin can do the whole flow.
- REST resource `{mount}/api` (must be requested explicitly as `resource`); scopes `owner:draft` + `owner:publish` cover `createItem`, `updateItem`, `publishItem` and `pinItem`.
- Still to prove end to end: dynamic registration of a public client, the consent click, and a real publish + pin. Fallback: a manual token from More → Client access, pasted in.

Screens (mockup on the design canvas): Connect → Compose → Preview, publish and pin → Resolve → anyone's public score. The form asks questions instead of naming fields: *What do you think will happen? How sure are you? By when? How would a stranger check it?* (source, condition, fallback), with a live checkability list. Pinning is automatic and never named as a step.

Upstream ask for Studio (an issue, once the composer works): render `claim` blocks as cards on public pages, as 0.62 does for math, and fold a composer into Studio itself.

## Studio extension (stretch goal)

Findings from blygger-studio `docs/extensions.md`, `docs/extension-vendoring.md` and `vgururao/newnature/mods/book-dashboard`:

- **Resolving from Studio works.** An extension's UI gets the SDK client with the owner's session. book-dashboard edits existing items with `patch(id, contentMd, expectedRevision)` and then `publish(id, note, expectedRevision)`. Resolve = append the `resolution` block, publish with the note "Resolved YES/NO/void". Publish sends the whole working copy, so v0.1 refuses to resolve an item with an unpublished draft.
- **Browser-only.** A vendored extension has no server half: no routes and no server-side AI. Cross-blyg scoring and the public report stay in the CLI.
- **Layout.** Only `.ts`, `.tsx` and `.css` under `ui/`; imports only React, `src/ui/extension-api.ts`, `sdk/dist/browser.js` and its own files. Tests and `package.json` stay outside the extension path.
- **Source build.** Vendoring needs a Studio source tree at the live version (`npm run ext:add`, then `npm run build`). caseyjr-blyg is a Worker-archive install, so develop against a local source clone with `wrangler dev` and decide later whether the live node moves.
- **No stability promise.** The extension API has no version. Pin to a Studio release.

Scope, in order:

1. **Byline badge** (`entryByline`): p, due date, status.
2. **Claim card** (`entryActions` → `openSheet`), with **Resolve**.
3. **+CLAIM** (`draftCounter`): a form that copies a valid `claim` block to the clipboard, as book-dashboard's +REF does (a slot can't insert at the cursor).
4. **Locked claim block** (`editorRegions`): once published, the block is held out of the full editor's text box and read-only when shown.
5. **Claims page** (`page`, menu zone `hidden`): open, due and overdue claims, and the owner's calibration.

To publish: give operators the repo, the full commit, the path (`extension`) and the tree hash for one `ext:add` line.

## Commit habits

Small commits, straight to `main`, each one working. One idea per commit: a schema, a parser case, a test, a doc section. Nothing but the README and this plan was committed before kickoff.
