/*
 * claims: a claim bar in the composer and the full editor. "+ claim" opens a
 * form that asks plain questions (what will happen, how sure, by when, how
 * anyone will check) and inserts a `claim` block, the format blyggi.com and
 * blyg-claims read and score. With a claim already in the post, the bar shows
 * it in a few words and opens it for editing. Selected words become the
 * claim's statement and stay in the post as its prose.
 *
 * Browser only: it reads nothing but the editor's text, makes no network
 * requests and writes only through the bar's insert and replace.
 * Source: https://github.com/miguelito4/blyg-claims (extension/).
 */
import { toast } from '../../../src/ui/extension-api.ts';
import type { EditorBarContext, StudioExtension } from '../../../src/ui/extension-api.ts';
import { fromClaim, sureOf, type Draft } from './core/compose.ts';
import { fenced, findClaim, placeNew } from './blocks.ts';
import { ClaimSheet } from './claim-sheet.tsx';
import './claims.css';

const date = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

function ClaimBar({ context }: { context: EditorBarContext }) {
  const found = findClaim(context.shown);

  const open = () => {
    const text = context.shown;
    const selection = context.selection();
    const selected = text.slice(selection.start, selection.end).replace(/\s+/g, ' ').trim();
    const start: Draft = found ? fromClaim(found.claim) : { shape: 'binary', statement: selected, resolvesBy: '', probability: 0.6 };
    context.openSheet((close) => (
      <ClaimSheet
        start={start}
        editing={!!found}
        close={close}
        onDone={(claim) => {
          if (found) {
            context.replace(found.start, found.end, fenced(claim));
          } else {
            const place = placeNew(text, selection, claim, !selected);
            context.replace(place.start, place.end, place.insert);
          }
          close();
          toast(found ? 'Claim updated.' : 'Claim added. When you publish, pin that version so it counts.');
        }}
      />
    ));
  };

  return (
    <span className="claims-bar">
      <button type="button" className="act" data-action="claims-open" onClick={open} title={found ? 'Open the claim in this post' : 'Add a checkable forecast to this post'}>
        {found ? 'edit claim' : '+ claim'}
      </button>
      {found ? (
        <span className="claims-summary" title={String(found.claim.claim ?? '')}>
          <b>{sureOf(found.claim)}</b> · by {date(found.claim.resolves_by)}
        </span>
      ) : null}
    </span>
  );
}

export const extension: StudioExtension = {
  name: 'claims',
  label: 'Claims',
  description: 'Adds a claim bar to the editor: answer a few plain questions and it inserts a forecast anyone can check and score.',
  editorBar: { label: 'Claims', row: 'above', blocks: 2, component: ClaimBar },
};
