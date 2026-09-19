"""Lint every page type on the built site, and every link between them.

    python3 scripts/audit_site.py                 # the live site
    python3 scripts/audit_site.py http://127.0.0.1:8020   # a local dev server

Exists because the test suites cannot see a page. pytest checks the generator,
`node --test` checks the rules, and neither notices a page that renders with a
missing heading, a doubly-escaped entity, a canonical pointing at a sibling, or
a link to a file nobody built. Those are the mistakes that survive a green
suite, so they get their own pass over the real HTTP responses.

Every check is a rule over all pages of a type rather than an assertion about
one page, so a page added later is audited without anybody remembering to.
Exit code is the number of distinct failures.
"""
import random
import re
import time
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

LIVE = "https://quiquae.github.io/manuscript-matching/"
UA = {"User-Agent": "manuscript-matching-audit/1.0"}
MS_SAMPLE = 40          # per-manuscript pages to lint in full
LINK_WORKERS = 8        # polite against Pages, and against Bodleian


def get(url, method="GET", tries=3):
    """Retry a connection failure before believing it.

    Eight manuscript pages were reported broken on the first run and all eight
    answered 200 when asked one at a time: the audit had rate-limited itself.
    An audit that cries wolf gets ignored, which is worse than not having one.
    """
    for attempt in range(tries):
        req = urllib.request.Request(url, headers=UA, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, (r.read().decode("utf-8", "replace")
                                  if method == "GET" else "")
        except urllib.error.HTTPError as e:
            return e.code, ""
        except Exception:                          # noqa: BLE001
            if attempt == tries - 1:
                return 0, ""
            time.sleep(1.5 * (attempt + 1))
    return 0, ""


# ---------------------------------------------------------------- extraction

def tag_attr(html, tag, attr, extra=""):
    m = re.search(rf"<{tag}\b[^>]*{extra}[^>]*\b{attr}=[\"']([^\"']*)[\"']", html, re.I)
    return m.group(1) if m else None


def meta(html, kind, name):
    m = re.search(rf'<meta\s+{kind}="{re.escape(name)}"\s+content="([^"]*)"', html, re.I)
    return m.group(1) if m else None


def links(html):
    return re.findall(r'<a\b[^>]*\bhref="([^"]+)"', html, re.I)


def images(html):
    return re.findall(r"<img\b([^>]*)>", html, re.I)


# -------------------------------------------------------------------- checks

def lint(url, html, base):
    """Every rule that applies to any page. Returns a list of complaints."""
    bad = []
    say = bad.append

    if not re.search(r'<html\b[^>]*\blang="[a-z-]+"', html, re.I):
        say("no lang on <html>")
    if not re.search(r'<meta\s+charset=', html, re.I):
        say("no charset")
    if "viewport" not in html:
        say("no viewport")

    h1s = re.findall(r"<h1\b", html, re.I)
    if len(h1s) != 1:
        say(f"{len(h1s)} h1 elements, want exactly 1")

    title = re.search(r"<title>([^<]*)</title>", html)
    if not title or not title.group(1).strip():
        say("no <title>")
    elif len(title.group(1)) > 70:
        say(f"title is {len(title.group(1))} chars")

    robots = meta(html, "name", "robots") or ""
    indexed = "noindex" not in robots
    canonical = tag_attr(html, "link", "href", extra='rel="canonical"')

    # Everything from here to the entity checks is about being found. A page
    # marked noindex is not being offered, so a missing canonical or og:image on
    # 404.html is the design, not a defect.
    if indexed:
        desc = meta(html, "name", "description")
        if desc is None:
            say("no meta description")
        elif not 50 <= len(desc) <= 170:
            say(f"description is {len(desc)} chars")

        if canonical is None:
            say("no canonical")
        elif canonical != url:
            say(f"canonical points at {canonical}")

        og_url = meta(html, "property", "og:url")
        if og_url and canonical and og_url != canonical:
            say("og:url and canonical disagree")
        if not meta(html, "property", "og:image"):
            say("no og:image")
        if not meta(html, "name", "twitter:card"):
            say("no twitter:card")

    # Double escaping: the TEI carries entities, so escaping twice prints them.
    for pattern, what in [(r"&amp;#\d", "&amp;#NN"), (r"&amp;amp;", "&amp;amp;"),
                          (r"&amp;quot;", "&amp;quot;")]:
        if re.search(pattern, html):
            say(f"double-escaped entity ({what})")

    # Template leakage. Checked in visible text only, so CSS and JS are spared.
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    # A rendered Python None or JS undefined appears where a value was meant to
    # be: after a colon, inside a tag, or alone. Matching the bare word flagged
    # the dating article for the sentence "None of it is a substitute for a
    # palaeography handbook", which is English.
    for pattern, token in [(r"(?::|>|,)\s*(?:None|undefined|NaN)\b", "a null value"),
                           (r"\$\{", "${"), (r"\{\{", "{{"),
                           (r"\[object Object\]", "[object Object]")]:
        if re.search(pattern, text):
            say(f"{token} in visible text")

    for attrs in images(html):
        if not re.search(r"\balt=", attrs, re.I):
            src = re.search(r'src="([^"]*)"', attrs)
            say(f"img with no alt: {src.group(1)[:60] if src else '?'}")

    for href in links(html):
        if href.startswith(("http://", "https://", "mailto:", "#")):
            continue
        if href.startswith("/"):
            say(f"root-relative href on a project site: {href}")

    return bad, robots, [urllib.parse.urljoin(url, h) for h in links(html)
                         if not h.startswith(("mailto:", "#"))]


# ---------------------------------------------------------------------- main

def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else LIVE
    if not base.endswith("/"):
        base += "/"
    print(f"auditing {base}\n")

    status, sitemap = get(base + "sitemap.xml")
    if status != 200:
        print(f"FAIL sitemap.xml -> {status}")
        return 1
    listed = re.findall(r"<loc>([^<]+)</loc>", sitemap)
    ms_urls = [u for u in listed if "/ms/" in u]
    top = [u for u in listed if "/ms/" not in u]
    print(f"sitemap: {len(listed)} URLs ({len(top)} top-level, {len(ms_urls)} manuscripts)")

    # Every page type, plus a sample of manuscript pages and the edge cases.
    random.seed(20260918)
    targets = list(top) + [base + "404.html"] + random.sample(ms_urls, min(MS_SAMPLE, len(ms_urls)))
    # Edge cases taken from the sitemap rather than guessed. A hand-written
    # slug in this list was a 404 on the first run, which is the audit reporting
    # its own typo as a defect in the site.
    def pick(pattern):
        return next((u for u in ms_urls if re.search(pattern, u)), None)

    for pattern in [r"jesus-college",          # a third-party rights holder
                    r"-\d{4,}\.html$",         # a slug disambiguated by record id
                    r"ashmole-828"]:           # the longest folded page
        found = pick(pattern)
        if found and found not in targets:
            targets.append(found)

    failures = Counter()
    detail = defaultdict(list)
    all_links = set()
    noindexed = []

    def visit(url):
        code, html = get(url)
        if code != 200:
            return url, [f"HTTP {code}"], "", []
        bad, robots, found = lint(url, html, base)
        return url, bad, robots, found

    with ThreadPoolExecutor(max_workers=LINK_WORKERS) as pool:
        for url, bad, robots, found in pool.map(visit, targets):
            all_links |= set(found)
            if "noindex" in robots:
                noindexed.append(url)
            for complaint in bad:
                failures[complaint] += 1
                detail[complaint].append(url)

    print(f"linted {len(targets)} pages, {len(noindexed)} of them noindex\n")

    # A noindex page in the sitemap is a reported crawl error, once per URL.
    contradictions = [u for u in noindexed if u in set(listed)]
    if contradictions:
        failures["noindex page listed in the sitemap"] = len(contradictions)
        detail["noindex page listed in the sitemap"] = contradictions

    # Every internal link discovered must resolve.
    internal = sorted(u for u in all_links
                      if u.startswith(base) or u.startswith(base.rstrip("/")))
    print(f"checking {len(internal)} distinct internal links")
    with ThreadPoolExecutor(max_workers=LINK_WORKERS) as pool:
        for url, code in zip(internal, pool.map(lambda u: get(u, "HEAD")[0], internal)):
            if code != 200:
                failures["broken internal link"] += 1
                detail["broken internal link"].append(f"{url} -> {code}")

    print()
    if not failures:
        print("no findings")
        return 0
    print(f"{sum(failures.values())} findings in {len(failures)} classes:\n")
    for complaint, n in failures.most_common():
        print(f"  [{n}] {complaint}")
        for where in detail[complaint][:3]:
            print(f"        {where}")
        if len(detail[complaint]) > 3:
            print(f"        ... and {len(detail[complaint]) - 3} more")
    return len(failures)


if __name__ == "__main__":
    sys.exit(main())
