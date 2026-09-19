"""One page per manuscript, and the two pages that lead to them.

Why this exists: the games are canvas, and a canvas is invisible to a search
engine. Three pages of about two hundred words was the whole indexable surface
of the site. The corpus, meanwhile, is 2,201 manuscripts that people look up by
shelfmark -- so the pages are both the honest way to credit the Bodleian and
the only real answer to being findable.

The rule for every page: show what the cataloguer wrote, say where it came
from, and never present the game's arithmetic as the catalogue’s judgement. The
audience for a page about MS. Douce 1 includes people who will notice.
"""
import html
import json
from pathlib import Path

from build.vocab import ROLES, material_label, role_label, subject_label

BASE = "https://quiquae.github.io/manuscript-matching/"
IMAGE_WIDTH = 760           # the page's own image; big enough to read a hand by
THUMB_WIDTH = 200           # look-alikes and search results

# The TEI, and so the built JSON, already carries HTML entities in places:
# "Sommer&#x27;s". Escaping that again renders the entity itself on the page.
# Unescape first, then escape once, which is idempotent for well-formed text.
def e(text):
    return html.escape(html.unescape(str(text or "")))


# Above this many characters a block is folded. The catalogue’s decoration
# notes run to eight thousand words on a heavily illuminated romance, and a
# page nobody can scan is not more credible for holding everything at once.
FOLD_OVER = 700


# The fields that make a page worth indexing: the cataloguer’s own words, as
# opposed to the identifiers every page has.
_PROSE = ("hand", "layout", "acquisition")
_LISTED = ("decoration", "contents", "subjects")


def prose_length(detail: dict) -> int:
    """How much the catalogue actually says about this manuscript."""
    n = sum(len(str(detail.get(f) or "")) for f in _PROSE)
    n += sum(len(str(x)) for f in _LISTED for x in (detail.get(f) or []))
    return n + sum(len(str(o.get("name") or "")) for o in (detail.get("owners") or []))


def indexable(detail: dict) -> bool:
    """Whether a page should be offered to a search engine.

    Eight of 2,201 records -- all Greek papyri -- carry no catalogue prose at
    all: no hand, no layout, no decoration, no contents, no owners. Those pages
    still hold a photograph, a shelfmark, a catalogued date, an origin and a
    link to the record, so they are worth existing and worth crawling. They are
    not worth indexing, because a page whose only text is its own identifiers is
    what a search engine means by a doorway.

    A rule rather than a list of eight: if the Bodleian catalogues a bare record
    tomorrow it is handled without anybody noticing it needed handling.
    """
    return prose_length(detail) > 0


DESCRIPTION_MAX = 160


def clip(text, limit=DESCRIPTION_MAX):
    """Trim to `limit` on a word boundary.

    A backstop, not the fix: `date_label` stops the one field that made a
    938-character description. This bounds the result whatever any other
    field turns out to hold. Over-long descriptions are not penalised, they
    are truncated mid-word by whoever renders them, which puts the cut
    outside our control.
    """
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return cut if cut.endswith(".") else cut + "\u2026"


def _head(title, description, path, image, extra="", robots=""):
    """The metadata block, identical in shape to the hand-written pages'."""
    url = BASE + path
    return f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
{robots}
<link rel="canonical" href="{e(url)}">
<link rel="icon" href="{'../' if '/' in path else ''}favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#f4efe4">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Manuscript Matching">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(image)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="{'../' if '/' in path else ''}style.css">
{extra}"""


def _masthead(up="", site_is_h1=False):
    """The masthead.

    On these pages the subject is a manuscript or a list, not the site, so the
    site name steps down from <h1> and the page's own subject takes it. One h1
    per page, and it names what the page is about.
    """
    title = ("<h1>" if site_is_h1 else '<p class="site-title">')
    close = ("</h1>" if site_is_h1 else "</p>")
    return f"""<a class="skip" href="#main">Skip to the content</a>

<header>
  {title}<a href="{up}index.html">Manuscript Matching</a>{close}
  <p class="game-name">Bodleian manuscripts</p>
  <nav aria-label="Sections">
    <a class="mode" href="{up}index.html">Arrange</a>
    <a class="mode" href="{up}look.html">Look Closer</a>
    <a class="mode" href="{up}shelf.html">The Shelf</a>
    <a class="mode" href="{up}search.html">Search</a>
    <a class="mode" href="{up}dating.html">Dating by eye</a>
  </nav>
</header>"""


FOOTER = """<footer>
  <p class="attribution">
    Catalogue text from the Bodleian Libraries’
    <a href="https://github.com/bodleian/medieval-mss">medieval-mss</a>.
    Images © Bodleian Libraries, University of Oxford, served from
    Digital Bodleian under
    <a href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a>.
  </p>
</footer>"""


def _summary(row, vocab):
    """'c. 1300–1325 · England · parchment · Latin', skipping what is unknown."""
    language = vocab.get("languages", {}).get(row.get("language"), row.get("language"))
    parts = [row.get("date_label") or f"{row['not_before']}–{row['not_after']}",
             row.get("region"), material_label(row.get("material", "")), language]
    return " · ".join(p for p in parts if p and p not in {"unknown", "Elsewhere"})


def _fold(heading, body, length, count=0):
    """A block, folded when it is long enough to bury the rest of the page."""
    if length <= FOLD_OVER:
        return f'<section class="ms-block"><h2>{e(heading)}</h2>{body}</section>'
    label = f"{heading} — {count} notes" if count > 1 else heading
    return (f'<section class="ms-block"><details class="ms-fold">'
            f'<summary>{e(label)}</summary>{body}</details></section>')


def _prose(heading, text):
    if not text:
        return ""
    return _fold(heading, f"<p>{e(text)}</p>", len(text))


def _notes(heading, items):
    """An array of catalogue notes, each as its own paragraph rather than run on.

    The fields this renders are arrays in the source because the cataloguer wrote
    separate observations. Joining them with a space produced one unreadable
    paragraph, which is how a page ends up holding everything and showing
    nothing.
    """
    notes = [n for n in (items or []) if str(n).strip()]
    if not notes:
        return ""
    body = "".join(f"<p>{e(n)}</p>" for n in notes)
    return _fold(heading, body, sum(len(str(n)) for n in notes), len(notes))


def _provenance(owners):
    """Who had it, as catalogued. The first thing a medievalist reads."""
    # One person catalogued twice -- once per role, or once per part of a
    # composite -- should be one line, with their roles gathered.
    gathered = {}
    for owner in (owners or []):
        name = str(owner.get("name") or "").strip()
        if not name:
            continue
        roles = gathered.setdefault(name, [])
        for code in str(owner.get("role") or "").split():
            if code not in roles:
                roles.append(code)
    if not gathered:
        return ""

    items, expanded = [], False
    for name, codes in gathered.items():
        label = ", ".join(role_label(c) for c in codes if role_label(c))
        # Only cite the Library of Congress if a code was actually looked up in
        # it. `role_label` passes an unknown code straight through, so a truthy
        # label is not evidence that anything was expanded.
        if any(c in ROLES for c in codes):
            expanded = True
        items.append(f"<li>{e(name)}"
                     + (f' <span class="ms-role">{e(label)}</span>' if label else "")
                     + "</li>")

    note = ('<p class="ms-note">Roles are the catalogue\'s MARC relator codes, expanded '
            'against <a href="https://id.loc.gov/vocabulary/relators.html">the Library of '
            'Congress list</a>. A code it does not hold is left as catalogued.</p>'
            if expanded else "")
    return ('<section class="ms-block"><h2>Provenance</h2>'
            f'<ul class="ms-owners">{"".join(items)}</ul>{note}</section>')


def _lookalikes(ids, index_by_id, slug_of):
    """Manuscripts the build judged nearby. Named as a guess, because it is."""
    near = [index_by_id[i] for i in (ids or []) if i in index_by_id][:6]
    if not near:
        return ""
    items = "".join(
        f'<a class="strip-item" href="{e(slug_of[r["id"]])}.html">'
        f'<img src="{e(r["iiif"])}/full/{THUMB_WIDTH},/0/default.jpg" loading="lazy"'
        f' decoding="async" alt="{e(r.get("shelfmark") or r["id"])}">'
        f'<span class="strip-shelf">{e(r.get("shelfmark") or r["id"])}</span>'
        f'<span class="strip-when">{e(r.get("date_label") or "")}</span></a>'
        for r in near)
    return ('<section class="ms-block"><h2>Of about the same date and place</h2>'
            f'<div class="strip">{items}</div>'
            '<p class="ms-note">Grouped by catalogued date, origin and support by this '
            'site, not by the Bodleian. It is a starting point for comparison, not an '
            'argument that these hands are related.</p></section>')


def manuscript_page(row, detail, vocab, index_by_id, slug_of, lookalikes):
    """One manuscript's page."""
    shelfmark = row.get("shelfmark") or row["id"]
    slug = slug_of[row["id"]]
    summary = _summary(row, vocab)
    language = vocab.get("languages", {}).get(row.get("language"), row.get("language"))
    support = material_label(row.get("material", ""))
    place = detail.get("place_name") or row.get("region") or ""
    subjects = ", ".join(subject_label(s) for s in (detail.get("subjects") or []))
    image = f'{row["iiif"]}/full/{IMAGE_WIDTH},/0/default.jpg'

    # Read aloud, so prose rather than the summary's middle dots.
    alt = " ".join(x for x in [
        f"A page of {shelfmark},",
        f"a {support} manuscript" if support else "a manuscript",
        f"from {place}," if place else "",
        f"{row.get('date_label') or ''}.",
    ] if x).replace(" ,", ",").replace(" .", ".")

    described = " ".join(x for x in [
        f"{shelfmark}:",
        f"a {support} manuscript" if support else "a manuscript",
        f"from {place}." if place else "of unrecorded origin.",
        f"{row.get('date_label') or ''}.".strip("."),
        f"In {language}." if language else "",
        "From the Bodleian Libraries’ catalogue of Western medieval manuscripts.",
    ] if x).replace(" .", ".")

    ld = {
        "@context": "https://schema.org",
        "@type": "Manuscript",          # schema.org, subClassOf CreativeWork
        "name": shelfmark,
        "url": BASE + f"ms/{slug}.html",
        "image": image,
        "inLanguage": row.get("language") or None,
        "material": support or None,
        "dateCreated": row.get("date_label") or None,
        "temporalCoverage": f"{row['not_before']}/{row['not_after']}",
        "locationCreated": {"@type": "Place", "name": place} if place else None,
        "holdingArchive": {
            "@type": "ArchiveOrganization",
            "name": "Bodleian Libraries, University of Oxford",
            "url": "https://www.bodleian.ox.ac.uk/",
        },
        "sameAs": [u for u in [row.get("catalogue"), detail.get("digitalBodleian")] if u],
        "isAccessibleForFree": True,
    }
    ld = {k: v for k, v in ld.items() if v}
    ld_block = ('<script type="application/ld+json">\n'
                + json.dumps(ld, indent=2, ensure_ascii=False) + "\n</script>")

    # Digital Bodleian’s own attribution string already names the licence, so
    # appending a second CC line printed it twice.
    attribution = row.get("attribution") or "Bodleian Libraries, University of Oxford"
    credit = e(attribution)
    if "CC BY" not in attribution:
        credit += (' · <a href="https://creativecommons.org/licenses/by-nc/4.0/">'
                   "CC BY-NC 4.0</a>")

    facts = [("Shelfmark", shelfmark),
             # The full wording, not the label: this row is the quotation.
             ("Date, as catalogued", detail.get("date_display")
                                     or row.get("date_label") or ""),
             ("Origin", place),
             ("Support", support),
             ("Language", language or ""),
             ("Subjects", subjects)]
    rows_html = "".join(
        f"<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>" for k, v in facts if v)

    links = []
    if row.get("catalogue"):
        links.append(f'<a href="{e(row["catalogue"])}">Bodleian catalogue record ↗</a>')
    if detail.get("digitalBodleian"):
        links.append(f'<a href="{e(detail["digitalBodleian"])}">All the images ↗</a>')

    return f"""<!doctype html>
<html lang="en">
<head>
{_head(f"{shelfmark} — Bodleian Libraries", clip(described), f"ms/{slug}.html", image, ld_block,
        "" if indexable(detail)
        else '<meta name="robots" content="noindex,follow">')}
</head>
<body>
{_masthead("../")}

<main id="main">
<article class="ms">
  <p class="crumb"><a href="../search.html">All 2,201 manuscripts</a></p>
  <h1 class="ms-shelfmark">{e(shelfmark)}</h1>
  <p class="ms-summary">{e(summary)}</p>

  <figure class="ms-figure">
    <img src="{e(image)}" alt="{e(alt)}" decoding="async" width="{IMAGE_WIDTH}">
    <figcaption>{credit}</figcaption>
  </figure>

  <dl class="ms-facts">{rows_html}</dl>

  {_notes("Contents", detail.get("contents"))}
  {_prose("The hand", detail.get("hand") or "")}
  {_prose("Layout", detail.get("layout") or "")}
  {_notes("Decoration", detail.get("decoration"))}
  {_provenance(detail.get("owners"))}
  {_prose("Acquisition", detail.get("acquisition") or "")}
  {_lookalikes(lookalikes.get(row["id"]), index_by_id, slug_of)}

  <p class="links">{" · ".join(links)}</p>

  <section class="ms-source">
    <h2>Where this comes from</h2>
    <p>The contents, hand, layout, decoration, provenance and acquisition above are
    quoted from the Bodleian Libraries’ catalogue of Western medieval manuscripts
    (<a href="https://github.com/bodleian/medieval-mss">bodleian/medieval-mss</a>).
    The image is served from Digital Bodleian under CC BY-NC 4.0.</p>
    <p><strong>Cite the catalogue, not this page.</strong> The date shown as catalogued
    is the Bodleian’s. The range {row['not_before']}–{row['not_after']} beside it is
    this site’s own reading of that date, flattened to two integers so manuscripts can
    be sorted and played against each other; it drops any <em>ante</em>, <em>post</em>
    or <em>circa</em> the cataloguer wrote. Where the two disagree, the catalogued date
    is the one that is right.</p>
  </section>

  <p class="ms-play"><a class="mode" href="../index.html">Put manuscripts like this in
  date order →</a></p>
</article>
</main>

{FOOTER}
</body>
</html>
"""


def browse_page(index, slug_of, vocab):
    """Every manuscript, by century, in one crawlable list."""
    by_century = {}
    for row in sorted(index, key=lambda r: (r["not_before"], r.get("shelfmark") or "")):
        by_century.setdefault(row["not_before"] // 100 * 100, []).append(row)

    def heading(start):
        if start < 0:
            return f"{abs(start) // 100 + 1}th century BC"
        return f"{start // 100 + 1}th century" + (f" ({start}s)" if start else "")

    sections = []
    for start in sorted(by_century):
        items = "".join(
            f'<li><a href="ms/{e(slug_of[r["id"]])}.html">{e(r.get("shelfmark") or r["id"])}</a>'
            f' <span class="browse-when">{e(_summary(r, vocab))}</span></li>'
            for r in by_century[start])
        sections.append(f'<section class="ms-block"><h2>{e(heading(start))} '
                        f'<span class="browse-count">{len(by_century[start])}</span></h2>'
                        f'<ul class="browse-list">{items}</ul></section>')

    described = (f"All {len(index)} manuscripts the games draw from, by century, with "
                 "shelfmark, date, origin, support and language. From the Bodleian "
                 "Libraries’ catalogue.")
    return f"""<!doctype html>
<html lang="en">
<head>
{_head("Every manuscript, by century — Manuscript Matching", clip(described),
        "browse.html", BASE + "og.png")}
</head>
<body>
{_masthead()}

<main id="main">
  <p class="crumb"><a href="search.html">Search them instead →</a></p>
  <h1 class="headline">{len(index)} manuscripts</h1>
  <p class="ms-summary">Everything the games draw from, oldest first. Each one links to
  its own page, and from there to the Bodleian’s catalogue record.</p>
  {"".join(sections)}
</main>

{FOOTER}
</body>
</html>
"""


def sitemap(paths):
    urls = "".join(
        f"  <url><loc>{e(BASE + p)}</loc></url>\n" for p in paths)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls}</urlset>\n")
