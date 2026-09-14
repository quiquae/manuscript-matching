import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The metadata a link preview and a crawler read.
 *
 * Every rule here is written to fail on the next page somebody adds, not to
 * re-check the three that exist. The failure modes it is built for: a new page
 * with no description, a canonical URL copy-pasted from a sibling and left
 * pointing at the wrong file, a domain changed in one place out of five, and a
 * page that never reaches the sitemap.
 */
const SITE = fileURLToPath(new URL("..", import.meta.url));
const BASE = "https://quiquae.github.io/manuscript-matching/";

const read = (name) => readFileSync(SITE + name, "utf8");
const pages = readdirSync(SITE).filter((f) => f.endsWith(".html"));
const indexable = pages.filter((f) => f !== "404.html");

/** The canonical path for a file: the home page is the bare directory. */
const urlFor = (file) => BASE + (file === "index.html" ? "" : file);

const meta = (html, attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
};
const linkHref = (html, rel) => {
  const m = html.match(new RegExp(`<link rel="${rel}"[^>]*href="([^"]*)"`));
  return m ? m[1] : null;
};

test("there are pages to check", () => {
  assert.ok(indexable.length >= 3, `found ${indexable.length}`);
  assert.ok(pages.includes("404.html"), "no 404 page");
});

for (const file of indexable) {
  test(`${file} carries the metadata a crawler needs`, () => {
    const html = read(file);
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
    assert.ok(title, "no <title>");
    assert.ok(title.length <= 70, `title is ${title.length} chars: ${title}`);

    const desc = meta(html, "name", "description");
    assert.ok(desc, "no meta description");
    assert.ok(desc.length >= 50 && desc.length <= 170,
              `description is ${desc.length} chars`);

    assert.equal(linkHref(html, "canonical"), urlFor(file), "wrong canonical");
    assert.equal(meta(html, "property", "og:url"), urlFor(file), "wrong og:url");
    assert.equal(meta(html, "property", "og:title"), title, "og:title differs from <title>");
    assert.equal(meta(html, "property", "og:description"), desc, "og:description differs");
    assert.equal(meta(html, "property", "og:image"), `${BASE}og.png`);
    assert.equal(meta(html, "name", "twitter:card"), "summary_large_image");
    assert.equal(linkHref(html, "icon"), "favicon.svg");
    assert.equal(meta(html, "name", "theme-color"), "#f4efe4");
  });
}

test("the assets the metadata points at exist", () => {
  for (const f of ["og.png", "favicon.svg", "robots.txt", "sitemap.xml"]) {
    assert.ok(existsSync(SITE + f), `missing site/${f}`);
  }
});

test("the sitemap lists every indexable page, and nothing else", () => {
  const listed = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual([...listed].sort(), indexable.map(urlFor).sort());
});

test("robots points at the sitemap on the same host", () => {
  assert.match(read("robots.txt"), new RegExp(`^Sitemap: ${BASE}sitemap\\.xml$`, "m"));
});

test("the 404 page is kept out of the index and uses absolute links", () => {
  const html = read("404.html");
  assert.equal(meta(html, "name", "robots"), "noindex");
  // Pages serves this file for any missing path, so a relative href would
  // resolve against the address the visitor asked for.
  assert.equal(html.match(/href="(?!https:\/\/|mailto:)[^"]*"/g), null,
               "a relative href in 404.html will break on a deep URL");
});

test("index.html describes itself to search engines in JSON-LD", () => {
  const raw = read("index.html").match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(raw, "no JSON-LD block");
  const ld = JSON.parse(raw[1]);
  assert.equal(ld.url, BASE);
  assert.equal(ld.image, `${BASE}og.png`);
  assert.equal(ld.applicationCategory, "GameApplication");
  assert.ok(ld.isBasedOn?.url?.includes("bodleian"), "the source is not credited");
});
