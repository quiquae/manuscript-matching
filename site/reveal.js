/**
 * The reveal panel: what the catalogue says, then what only the whole corpus
 * can say, then the palaeographer's own description of the hand.
 *
 * Nothing here is ever a question. Owners, contents, bindings and bibliography
 * are the reward for playing, not the test.
 */

const THUMB = "/full/200,/0/default.jpg";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function dateLabel(card) {
  return card.date_display || `${card.not_before}–${card.not_after}`;
}

/** "Elsewhere" is a bucket label, not a place. It must never appear in a sentence. */
function regionPhrase(region) {
  return region === "Elsewhere" ? "outside the main centres" : `in ${region}`;
}

/**
 * Facts that only exist because we hold the whole corpus.
 *
 * Only surprising ones. "416 of these were made in Italy" is a bulk count and
 * tells a reader nothing; scarcity and named collectors do.
 */
const RARE = 40;              // at or below this, a count is worth remarking on
const BIG_COLLECTOR = 100;    // above this, an owner is a story in themselves

function corpusNotes(card, context) {
  const notes = [];

  // Scarcity within its own region and half-century.
  const half = Math.floor((card.not_before ?? 0) / 50) * 50;
  const peers = context?.buckets?.[`${card.region}|${half}`];
  if (peers && peers <= RARE) {
    notes.push(peers === 1
      ? `The only manuscript here made ${regionPhrase(card.region)} in these fifty years.`
      : `One of only ${peers} here made ${regionPhrase(card.region)} in these fifty years.`);
  }

  // Collectors big enough to be a fact about the library itself.
  for (const owner of (card.owners ?? []).slice(0, 2)) {
    const n = context?.owners?.[owner.name];
    if (n >= BIG_COLLECTOR) {
      notes.push(`${owner.name} owned ${n.toLocaleString()} of the manuscripts in this game.`);
    }
  }

  // A language you rarely meet.
  const langCount = context?.languages?.[card.language];
  if (langCount && langCount <= RARE) {
    notes.push(`One of only ${langCount} here in this language.`);
  }

  return notes.slice(0, 3);
}

export function renderReveal(el, card, { correct, gained, guessedYear, context, lookalikes, onNext }) {
  const owners = (card.owners ?? []).map((o) => o.name).filter(Boolean);
  const notes = corpusNotes(card, context);

  el.hidden = false;
  el.innerHTML = `
    <p class="verdict ${correct ? "right" : "wrong"}">
      ${correct ? "Correctly placed" : "Not quite"} &middot; ${gained} points
    </p>
    <h2>${escapeHtml(card.shelfmark || card.id)}</h2>
    <p class="when">${escapeHtml(dateLabel(card))}${
      card.place_name ? `, ${escapeHtml(card.place_name)}` : ""}</p>
    ${guessedYear ? `<p class="note">You placed it ${escapeHtml(guessedYear)}.</p>` : ""}
    ${card.contents?.length
      ? `<p class="contents">${escapeHtml(card.contents.join("; "))}</p>` : ""}
    ${card.hand
      ? `<blockquote class="hand"><h3>What the hand tells you</h3>${escapeHtml(card.hand)}</blockquote>` : ""}
    ${card.layout ? `<p class="note">${escapeHtml(card.layout)}</p>` : ""}
    ${card.decoration?.length
      ? `<p class="contents">${escapeHtml(card.decoration.join(" "))}</p>` : ""}
    ${owners.length
      ? `<p class="contents"><strong>Owned by</strong> ${escapeHtml(owners.join(" → "))}</p>` : ""}
    ${card.acquisition ? `<p class="note">${escapeHtml(card.acquisition)}</p>` : ""}
    ${notes.length
      ? `<ul class="corpus">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : ""}
    ${lookalikes?.length ? `
      <div class="lookalikes">
        <h3>What ${escapeHtml(card.region === "Elsewhere" ? "this date and place" : card.region)}, ${escapeHtml(dateLabel(card))} looks like</h3>
        <p class="note">Every one of these is a real manuscript. Open any of them.</p>
        <div class="strip">${lookalikes.map((p) => `
          <a class="strip-item" href="${escapeHtml(p.catalogue)}" target="_blank" rel="noopener"
             title="${escapeHtml(p.shelfmark)} — ${escapeHtml(dateLabel(p))}">
            <img loading="lazy" src="${escapeHtml(p.iiif)}${THUMB}" alt="${escapeHtml(p.shelfmark)}">
            <span class="strip-shelf">${escapeHtml(p.shelfmark || p.id)}</span>
            <span class="strip-when">${escapeHtml(dateLabel(p))}</span>
          </a>`).join("")}</div>
      </div>` : ""}
    <p class="links">
      <a href="${escapeHtml(card.catalogue)}" target="_blank" rel="noopener">See the catalogue record</a>
      ${card.digitalBodleian
        ? `<a href="${escapeHtml(card.digitalBodleian)}" target="_blank" rel="noopener">All the images</a>` : ""}
    </p>
    <button id="next-round">Next manuscript</button>`;

  const next = el.querySelector("#next-round");
  next.onclick = onNext;
  next.focus();
}
