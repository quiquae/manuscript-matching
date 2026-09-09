/**
 * The reveal panel: what the catalogue says, then what only the whole corpus
 * can say, then the palaeographer's own description of the hand.
 *
 * Nothing here is ever a question. Owners, contents, bindings and bibliography
 * are the reward for playing, not the test.
 */

const THUMB = "/full/170,/0/default.jpg";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function dateLabel(card) {
  return card.date_display || `${card.not_before}–${card.not_after}`;
}

/** Facts that only exist because we hold the whole corpus. */
function corpusNotes(card, context) {
  const notes = [];
  const inRegion = context?.regions?.[card.region];
  if (inRegion > 1) {
    notes.push(`${inRegion} manuscripts in this game were made in ${card.region}.`);
  }
  for (const owner of (card.owners ?? []).slice(0, 2)) {
    const n = context?.owners?.[owner.name];
    if (n > 1) notes.push(`${owner.name} owned ${n} of the manuscripts here.`);
  }
  for (const subject of (card.subjects ?? []).slice(0, 1)) {
    const n = context?.subjects?.[subject];
    if (n > 1) notes.push(`${n} of these books were catalogued under “${subject.replace(/_/g, " ")}”.`);
  }
  return notes;
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
        <h3>What ${escapeHtml(card.region)}, ${escapeHtml(dateLabel(card))} looks like</h3>
        <div class="strip">${lookalikes.map((p) =>
          `<img loading="lazy" src="${escapeHtml(p.iiif)}${THUMB}" alt="${escapeHtml(p.shelfmark)}">`
        ).join("")}</div>
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
