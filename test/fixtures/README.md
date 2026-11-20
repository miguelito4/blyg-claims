# Fixtures

`live/caseyjr/` is a snapshot of caseyjr.org/blyg taken 2026-11-20 at the paths the protocol serves (`blyg.json`, `items/index.json`, `items/{id}.json`, `items/{id}/v{n}.json`). Every `content_hash` matches `sha256(content_md)`.

- `12cq260v…` (open-weights claim, a thread): v1 → v2 changes only the transclusion on line one; the claim block is identical, so it is verified as of v1 (2026-10-13T15:04:27Z). Its prose restates the probability, which exercises the prose cross-check. `json` fence.
- `36ehyke3…` (earnings claim, a thread): one version, pinned (2026-10-21T00:22:25Z). Unlabeled fence.

Only the two claim items' documents are captured; the index lists all 92 items. Tests serve these files through a fake `fetch`, so nothing touches the network.
