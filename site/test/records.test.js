import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecords } from "../records.js";

const DETAILS = {
  m1: { hand: "Gothic textualis.", decoration: ["Fine initials"], date_display: "c. 1300" },
  m2: { hand: "Anglicana." },
};
const row = (id) => ({ id, shelfmark: `MS. ${id}`, not_before: 1300, decorated: true });

/** A loader that counts its calls, so "fetched once" is testable. */
function counting(result = DETAILS) {
  let calls = 0;
  const load = () => { calls += 1; return Promise.resolve(result); };
  return { load, calls: () => calls };
}

test("merge adds the details for a manuscript", async () => {
  const records = createRecords(() => Promise.resolve(DETAILS));
  const merged = await records.merge(row("m1"));
  assert.equal(merged.hand, "Gothic textualis.");
  assert.equal(merged.date_display, "c. 1300");
  assert.equal(merged.shelfmark, "MS. m1", "the index fields must survive");
});

test("a manuscript with no details entry comes back unchanged", async () => {
  const records = createRecords(() => Promise.resolve(DETAILS));
  assert.deepEqual(await records.merge(row("m99")), row("m99"));
});

test("the details are fetched once, however many reveals happen", async () => {
  const { load, calls } = counting();
  const records = createRecords(load);
  records.prefetch();
  await Promise.all([records.merge(row("m1")), records.merge(row("m2")), records.merge(row("m1"))]);
  assert.equal(calls(), 1);
});

/**
 * The reveal must still render when the details never arrive. Every field they
 * add is optional in reveal.js, so a failed fetch costs the player the
 * catalogue description and nothing else.
 */
test("a failed fetch degrades to the index row, it does not throw", async () => {
  const records = createRecords(() => Promise.reject(new Error("504")));
  assert.deepEqual(await records.merge(row("m1")), row("m1"));
});

test("a fetch that 404s degrades the same way", async () => {
  const records = createRecords(() => { throw new Error("404"); });
  assert.deepEqual(await records.merge(row("m1")), row("m1"));
});

/**
 * prefetch is fire-and-forget: nothing is awaiting it at the time it runs, so a
 * rejection with no handler would surface as an unhandled rejection and take
 * the page's error console with it.
 */
test("prefetch swallows a failure rather than leaving it unhandled", async () => {
  const records = createRecords(() => Promise.reject(new Error("504")));
  records.prefetch();
  await new Promise((r) => setTimeout(r, 5));      // let the rejection settle
  assert.deepEqual(await records.merge(row("m1")), row("m1"));
});

test("prefetch then merge shares the one fetch", async () => {
  const { load, calls } = counting();
  const records = createRecords(load);
  records.prefetch();
  records.prefetch();
  await records.merge(row("m1"));
  assert.equal(calls(), 1);
});

test("merging nothing is not a crash", async () => {
  const records = createRecords(() => Promise.resolve(DETAILS));
  assert.equal(await records.merge(undefined), undefined);
  assert.equal(await records.merge(null), null);
});

test("a details file that is not an object degrades instead of throwing", async () => {
  for (const junk of [null, undefined, "a string", 7]) {
    const records = createRecords(() => Promise.resolve(junk));
    assert.deepEqual(await records.merge(row("m1")), row("m1"), `junk: ${junk}`);
  }
});
