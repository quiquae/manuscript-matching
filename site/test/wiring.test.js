import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Every element a page's script reaches for must exist in that page.
 *
 * Nothing else here can catch this. `document.getElementById` returns null for
 * a name that is not in the markup, and the first thing done with the result is
 * usually a property assignment, so a missing id is a TypeError at play time in
 * a browser — invisible to both `node --test` and pytest. This is the check
 * that would have caught adding a `$("share")` handler and forgetting the
 * button, which is exactly the mistake the daily round invited.
 */
const PAGES = [
  ["../index.html", "../app.js"],
  ["../look.html", "../look.js"],
  ["../shelf.html", "../shelf-app.js"],
  ["../search.html", "../search.js"],
];

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** The ids the script looks up: `$("x")` and `getElementById("x")`. */
function lookedUp(js) {
  const found = new Set();
  for (const m of js.matchAll(/(?:\$|getElementById)\(\s*["']([\w-]+)["']\s*\)/g)) {
    found.add(m[1]);
  }
  return [...found];
}

/** The ids the markup declares. */
function declared(html) {
  return new Set([...html.matchAll(/\bid=["']([\w-]+)["']/g)].map((m) => m[1]));
}

for (const [page, script] of PAGES) {
  const name = page.replace("../", "");
  test(`${name} declares every id ${script.replace("../", "")} looks up`, () => {
    const ids = declared(read(page));
    const missing = lookedUp(read(script)).filter((id) => !ids.has(id));
    assert.deepEqual(missing, [], `not in ${name}: ${missing.join(", ")}`);
  });
}

test("each page loads the script that drives it", () => {
  for (const [page, script] of PAGES) {
    const src = script.replace("../", "");
    assert.match(read(page), new RegExp(`<script type="module" src="${src}"`),
                 `${page.replace("../", "")} does not load ${src}`);
  }
});
