import test from "node:test";
import assert from "node:assert/strict";
import { inspectHtml, xmlLocations } from "../src/technicalAudit.js";

test("extracts sitemap locations deterministically", () => {
  assert.deepEqual(xmlLocations("<urlset><url><loc>https://www.djelvio.nl/</loc></url><url><loc>https://www.djelvio.nl/blog</loc></url></urlset>"), ["https://www.djelvio.nl/", "https://www.djelvio.nl/blog"]);
});

test("audits canonical metadata, headings and structured data", () => {
  const html = `<!doctype html><html><head><title>DJ</title><meta name="description" content="DJ service"><link rel="canonical" href="https://www.djelvio.nl/test"><script type="application/ld+json">{"@type":"Service"}</script></head><body><h1>DJ test</h1><a href="/contact">Contact</a></body></html>`;
  const page = inspectHtml("https://www.djelvio.nl/test", html);
  assert.deepEqual(page.issues, []);
  assert.deepEqual(page.jsonLdTypes, ["Service"]);
  assert.equal(page.internalLinkCount, 1);
});

test("flags noindex, canonical mismatch and missing metadata", () => {
  const page = inspectHtml("https://www.djelvio.nl/test", `<meta name="robots" content="noindex"><link rel="canonical" href="https://www.djelvio.nl/other">`);
  assert.deepEqual(page.issues.sort(), ["canonical_mismatch", "missing_h1", "missing_meta_description", "missing_title", "noindex"].sort());
});
