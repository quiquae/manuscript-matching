/**
 * Boot one page's script against a stub DOM, in this process, and report.
 *
 *   node test/boot-page.mjs index.html app.js
 *
 * One process per page on purpose. Run in a shared process, a page's async tail
 * outlives its own test and then looks up elements against the *next* page's
 * stub, which reads exactly like a crash in the first page. That cost an hour.
 *
 * Prints one JSON line: { missing, asked, errors }.
 */
import { readFileSync } from "node:fs";

const [page, script] = process.argv.slice(2);
const here = new URL(".", import.meta.url);
const declared = new Set(
  [...readFileSync(new URL(`../${page}`, here), "utf8").matchAll(/\bid="([\w-]+)"/g)]
    .map((m) => m[1]));

const asked = [];
const missing = [];
const errors = [];

const el = (id) => ({
  id, hidden: false, textContent: "", innerHTML: "", value: "", dataset: {},
  className: "", style: {}, children: [], width: 0, height: 0, disabled: false,
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  append() {}, appendChild() {}, remove() {}, setAttribute() {}, removeAttribute() {},
  getAttribute: () => null, addEventListener() {}, removeEventListener() {},
  // A stub cannot parse innerHTML, so children built that way do not exist in
  // it. Answering null made every such component look broken; answering an
  // element is the right lie, and costs the ability to catch a real miss here.
  querySelector: () => el("found"), querySelectorAll: () => [],
  focus() {}, blur() {}, scrollIntoView() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
  getContext: () => ({
    fillRect() {}, drawImage() {}, clearRect() {}, save() {}, restore() {},
    beginPath() {}, arc() {}, fill() {}, stroke() {}, translate() {}, scale() {},
    getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4), width: 64, height: 64 }),
    putImageData() {}, set fillStyle(v) {}, set imageSmoothingQuality(v) {},
  }),
});

globalThis.document = {
  getElementById(id) {
    asked.push(id);
    if (!declared.has(id)) { missing.push(id); return null; }
    return el(id);
  },
  createElement: (tag) => el(`created-${tag}`),
  createRange: () => ({ selectNodeContents() {} }),
  querySelector: () => el("found"), querySelectorAll: () => [],
  addEventListener() {}, body: el("body"), documentElement: el("html"),
};

const store = new Map();
globalThis.window = {
  innerWidth: 1280, innerHeight: 900, devicePixelRatio: 2,
  location: { href: "http://localhost/", pathname: "/", search: "" },
  history: { replaceState() {} },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null),
                  setItem: (k, v) => store.set(k, String(v)) },
  addEventListener() {},
  getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
};
globalThis.localStorage = globalThis.window.localStorage;
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText: async () => {} } }, configurable: true,
});
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

// Every image fails at once: it is the path a player meets when Bodleian is
// down, and it keeps boot short enough to observe.
globalThis.Image = class {
  constructor() { setTimeout(() => this.onerror?.(new Error("no page")), 0); }
  set src(v) {}
};

const row = (i) => ({
  id: `m${i}`, slug: `s${i}`, shelfmark: `MS. Test ${i}`, date_label: "c. 1300",
  not_before: 800 + i * 40, not_after: 810 + i * 40, region: "England",
  material: "perg", language: "la", iiif: "https://iiif/1",
  catalogue: "https://c/1", attribution: "Bodleian", painted: i % 2 === 0,
});
const payload = {
  "puzzles.json": Array.from({ length: 30 }, (_, i) => row(i)),
  "details.json": { m0: { hand: "Textualis.", date_display: "c. 1300" } },
  "context.json": { total: 30, regions: {}, owners: {}, subjects: {} },
  "lookalikes.json": {},
  "vocab.json": { languages: { la: "Latin" }, materials: { perg: "parchment" }, roles: {} },
};
globalThis.fetch = async (url) => {
  const name = String(url).split("/").pop();
  return name in payload
    ? { ok: true, status: 200, json: async () => payload[name] }
    : { ok: false, status: 404, json: async () => ({}) };
};

process.on("unhandledRejection", (e) => errors.push(`unhandledRejection: ${e}`));
process.on("uncaughtException", (e) => errors.push(`uncaughtException: ${e}`));

await import(new URL(`../${script}`, here).href);
await new Promise((r) => setTimeout(r, 600));
console.log(JSON.stringify({ missing: [...new Set(missing)], asked: asked.length, errors }));
