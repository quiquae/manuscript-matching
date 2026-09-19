"""Load every page type in a real browser and check what JavaScript produced.

    python3 scripts/audit_rendered.py                      # local dev server
    python3 scripts/audit_rendered.py https://quiquae.github.io/manuscript-matching/

Exists because a page can pass every other check and still be broken. The suites
see modules and generators; the site audit sees HTML as served. Neither runs the
page. An uncaught TypeError at boot leaves a silent, empty game, and the markup
it came from lints perfectly.

So: headless Chrome per page, console and uncaught errors captured from stderr,
and assertions about the DOM *after* the module has run -- the chip rows Look
Closer builds, the cards Arrange deals, the results the search box renders.

Exit code is the number of pages with findings.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
LOCAL = "http://127.0.0.1:8020/"
TIMEOUT = 75

# Each page, and what must be in the DOM once its script has run. A count of 0
# means the selector must match nothing.
PAGES = {
    "": {
        ".card": (5, None),                 # the daily deals five
        "#modes .chip": (2, None),          # Daily, Endless
        "#collections .chip": (5, None),
        "#difficulties .chip": (3, None),
        "#round-label": (1, "Daily #"),
        "#streak": (1, None),
    },
    "look.html": {
        "#regions .chip": (7, None),
        "#materials .chip": (3, None),
        "#languages .chip": (6, None),
        "#decorated": (0, None),            # removed; must be gone from markup too
        "#view": (1, None),
    },
    "shelf.html": {"#headline": (1, "manuscripts"), ".bar": (1, None)},
    "search.html": {
        ".find-card": (60, None),
        "#f-century .chip": (2, None),
        "#f-region .chip": (2, None),
        "#count": (1, "manuscripts"),
    },
    "browse.html": {"h1": (1, "manuscripts")},
    "dating.html": {"h1": (1, "date a manuscript")},
    "ms/ms-ashmole-828.html": {"h1": (1, "Ashmole 828"), "details": (1, None)},
    "ms/ms-douce-1.html": {"h1": (1, "Douce"), ".ms-source": (1, None)},
    "404.html": {"h1": (0, None)},          # the masthead is a <p> there
}

# Console noise that is not ours and not a defect. Bodleian's image server fails
# often enough that a failed image fetch is a normal state, not a finding.
BENIGN = re.compile(
    r"iiif\.bodleian|digital\.bodleian|net::ERR_|Failed to load resource"
    r"|favicon|DevTools|Fontconfig|GPU|gpu_|Vulkan|dbus|sandbox|voice|"
    r"registration_protocol|GCM|google_apis|Network service|policy",
    re.I)

ERROR_LINE = re.compile(r"ERROR:CONSOLE|Uncaught|SEVERE:|ReferenceError|TypeError"
                        r"|SyntaxError|is not a function|is not defined", re.I)


def render(url):
    """(dom, console_errors). One throwaway profile per page, so none can lock."""
    with tempfile.TemporaryDirectory() as profile:
        proc = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
             "--no-default-browser-check", "--disable-extensions",
             f"--user-data-dir={profile}", "--enable-logging=stderr", "--log-level=0",
             "--virtual-time-budget=9000", "--dump-dom", url],
            capture_output=True, text=True, timeout=TIMEOUT)
    errors = [ln.strip() for ln in proc.stderr.splitlines()
              if ERROR_LINE.search(ln) and not BENIGN.search(ln)]
    return proc.stdout, errors


def count(dom, selector):
    """Enough of a selector engine for the assertions above: #id, .class, tag."""
    if selector.startswith("#"):
        return len(re.findall(rf'\bid="{re.escape(selector[1:])}"', dom))
    if " " in selector:                      # "#parent .child": scope, then count
        parent, child = selector.split(" ", 1)
        pid = parent.lstrip("#")
        m = re.search(rf'\bid="{re.escape(pid)}"[^>]*>(.*?)</(?:div|dl|p|section)>',
                      dom, re.S)
        return count(m.group(1), child) if m else 0
    if selector.startswith("."):
        return len(re.findall(rf'class="[^"]*\b{re.escape(selector[1:])}\b', dom))
    return len(re.findall(rf"<{re.escape(selector)}\b", dom, re.I))


def text_of(dom, selector):
    pid = selector.lstrip("#")
    m = re.search(rf'\bid="{re.escape(pid)}"[^>]*>(.*?)<', dom, re.S) if selector.startswith("#") \
        else re.search(rf"<{re.escape(selector)}\b[^>]*>(.*?)<", dom, re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else LOCAL
    if not base.endswith("/"):
        base += "/"
    print(f"rendering {base}\n")
    failed = 0

    for page, expect in PAGES.items():
        url = base + page
        try:
            dom, errors = render(url)
        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT  {page or '/'}")
            failed += 1
            continue

        bad = [f"console: {e[:140]}" for e in errors]
        for selector, (want, contains) in expect.items():
            got = count(dom, selector)
            if want == 0 and got:
                bad.append(f"{selector} should not exist, found {got}")
            elif want and got < want:
                bad.append(f"{selector}: {got}, want at least {want}")
            if contains:
                have = text_of(dom, selector)
                if contains.lower() not in have.lower():
                    bad.append(f"{selector} text {have[:50]!r} lacks {contains!r}")

        print(f"  {'FAIL' if bad else 'ok  '}  {page or '/'}")
        for b in bad:
            print(f"          {b}")
        failed += bool(bad)

    print(f"\n{failed} of {len(PAGES)} page types have findings")
    return failed


if __name__ == "__main__":
    sys.exit(main())
