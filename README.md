# blyg-claims

Prediction journals for [Blygger](https://blygger.org): post probabilistic claims as blyg items, resolve them as new versions, and score anyone's calibration from their public files.

**Judgment without money.** Provenance is the stake, and readers are the witnesses. No oracle, no token, no market. A blyg already publishes timestamped, versioned and pinnable items, which is everything a prediction journal needs. This repo adds a shape for claims and a scorer that reads it.

> Status: built during the [Blygger Hackathon 2026](https://protocol-institute.org/events/blygger-hackathon-2026/) (November 20–27). **Live at https://blyggi.com** (make a claim: https://blyggi.com/new/; any blyg's track record: https://blyggi.com/record/?blyg=caseyjr.org/blyg). Design notes in [PLAN.md](PLAN.md).

## The composer

A page that asks plain questions and builds a checkable claim from the answers:

1. **What kind of claim is this?** Yes or no · From a list (pick the winner, pick who makes it, put them in order) · How much · Just record it.
2. **What do you think will happen?**
3. **How will we know?** Blygger shows it · A published statistic · An official record shows it · A number on a web page · Someone decides.
4. **By when?**
5. **How sure are you?**
6. **Anything that would cancel it?**

Before you publish it catches the mistakes that look fine on the surface: a claim that is already true, data that won't be published by your date, a number that has to be exactly equal, vague words, percentages that don't add up. Then it publishes the claim to your own blyg and pins it (Blygger Studio, through OAuth; the page keeps nothing), or you copy the block into any blyg.

## The shape

A **claim** is an item, usually a fragment, whose Markdown carries a fenced `claim` block:

````markdown
Open-weights models will catch the frontier of December 2025 within 18 months.

```claim
{
  "probability": 0.85,
  "resolves_by": "2027-06-19",
  "criteria": "An open-weights model matches the best closed model of Dec 2025 on …",
  "provenance": "https://bits.caseyjr.org/…"
}
```
````

A **resolution** is a later version of the same item that adds a `resolution` block:

````markdown
```resolution
{ "outcome": true, "resolved_at": "2027-06-02", "evidence": ["https://…"] }
```
````

`outcome` is `true`, `false` or `"void"` (the criteria could not be applied). The claim's text and its `claim` block stay as they were. Only the resolution is added.

The protocol needs nothing new for this. Readers ignore what they don't understand, and the blocks render as code on any client.

## What makes a claim count

The scorer reads only public files (`blyg.json`, `items/index.json`, `items/{id}.json`, pins) and is strict about dating:

- **Pin the claim version.** Unpinned history is withheld by the protocol (spec §8), so a reader can't prove what the claim said before it was edited. A claim counts at full weight only if the version that first carried the `claim` block is pinned. The pin's `content_hash` is checked.
- **Edits are visible.** If a later version changes `probability` or `criteria`, the pinned original is scored and the edit is shown.
- **Silence is a miss.** A claim past `resolves_by` with no resolution is listed as overdue. Withdrawing an open claim doesn't hide it: withdrawn and overdue claims are counted and shown.
- **Anyone can resolve.** Another blyg can publish a resolution that responds to the claim (a stub or `[[id]]` link). The author's own resolution is scored, and other resolutions are shown beside it.

## Scores

For each blyg: Brier score, log score, a calibration chart (stated probability against the observed frequency, by bucket), and lists of open, due-soon, overdue and resolved claims. Scores can be computed across any set of blygs, so a reader can compare their own calibration with the blygs they follow.

## Parts

| Part | What it is |
| --- | --- |
| `schema/` | JSON Schemas for `claim` and `resolution` blocks |
| `src/` | Fetcher, parser and scorer (TypeScript, Node 22, no runtime dependencies) |
| `blyg-claims` CLI | `npx blyg-claims score https://caseyjr.org/blyg/` → JSON and a static HTML report |
| `extension/` | **Claims**, a browser-only Blygger Studio extension: a claim bar in the editor that inserts a checkable claim and reopens it for editing. Vendor it with `npm run ext:add`; see [`extension/README.md`](extension/README.md) |

## Prior discussion

- [blygger-spec#10](https://github.com/blygger/blygger-spec/issues/10): the brainstorm thread where this shape was first proposed, including commit-reveal (post a hash now, reveal later) and fork-a-challenge tournaments.
- Live claims on [caseyjr.org/blyg](https://caseyjr.org/blyg/), in the Claims hopper.

## License

MIT
