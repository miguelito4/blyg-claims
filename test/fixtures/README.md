# Fixtures

`live/caseyjr/` is a snapshot of caseyjr.org/blyg taken 2026-11-20 (refreshed 21:2x UTC for the third claim) at the paths the protocol serves (`blyg.json`, `items/index.json`, `items/{id}.json`, `items/{id}/v{n}.json`). Every `content_hash` matches `sha256(content_md)`.

- `12cq260v…` (open-weights claim, a thread): v1 → v2 changes only the transclusion on line one; the claim block is identical, so it is verified as of v1 (2026-10-13T15:04:27Z). Its prose restates the probability, which exercises the prose cross-check. `json` fence.
- `36ehyke3…` (earnings claim, a thread): one version, pinned (2026-10-21T00:22:25Z). Unlabeled fence.

- `08sexhm…` (hackathon-week claim, a thread): one version, pinned (2026-11-20T21:18:29Z), `claim` fence, p=0.85, resolves 2026-11-27. The first claim that resolves during the hackathon.

Only the three claim items' documents are captured; the index lists all 93 items. Tests serve these files through a fake `fetch`, so nothing touches the network.

`live/venkateshrao/` (captured 2026-11-21): the manifest and `32c0npw…`, the first claim on a blyg other than caseyjr.org/blyg. A thread, v2, not pinned, unlabeled fence, `criteria` "Consensus of mathematics community" (a judgment oracle), and a comment arguing against forcing every claim into one binary-probability shape.
