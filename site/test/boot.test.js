import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Does each page's script survive being run?
 *
 * Every other suite imports a module and calls a function. None executes a
 * page's entry script, which is where the crashes live: a handler bound to an
 * element that was deleted, an import of a name that moved, a top-level
 * statement that throws. The page lints perfectly and the game is a blank
 * rectangle.
 *
 * Headless Chrome would be the honest way. `--dump-dom` hangs on this machine
 * and `--screenshot` cannot report an exception, so each page is booted against
 * a stub DOM in its own process (see boot-page.mjs for why the process matters).
 *
 * What this proves: the script runs to the end, nothing rejects, and every
 * element it looked up during boot is declared in that page. What it cannot
 * see: layout, and anything reached through innerHTML.
 */
const HERE = fileURLToPath(new URL(".", import.meta.url));

for (const [page, script] of [["index.html", "app.js"], ["look.html", "look.js"],
                              ["shelf.html", "shelf-app.js"], ["search.html", "search.js"]]) {
  test(`${script} boots against ${page}`, () => {
    const out = execFileSync("node", [`${HERE}boot-page.mjs`, page, script],
                             { encoding: "utf8", timeout: 30000 });
    const { missing, asked, errors } = JSON.parse(out.trim().split("\n").pop());
    assert.deepEqual(errors, [], `${script} threw during boot`);
    assert.deepEqual(missing, [], `${script} looked up ids ${page} does not declare`);
    assert.ok(asked > 3, `${script} touched only ${asked} elements; did it run?`);
  });
}
