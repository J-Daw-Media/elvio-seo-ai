import { stableId } from "./identity.js";

function decode(value = "") {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

export function xmlLocations(xml = "") {
  return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decode(match[1]));
}

function attribute(html, tag, name, value, attributeName) {
  const elements = [...String(html).matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].map((match) => match[0]);
  const element = elements.find((item) => new RegExp(`${name}=["']${value}["']`, "i").test(item));
  return element?.match(new RegExp(`${attributeName}=["']([^"']*)["']`, "i"))?.[1] || null;
}

function text(html, tag) {
  const value = String(html).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"))?.[1] || "";
  return decode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

export function inspectHtml(url, html) {
  const canonical = attribute(html, "link", "rel", "canonical", "href");
  const description = attribute(html, "meta", "name", "description", "content");
  const robots = attribute(html, "meta", "name", "robots", "content");
  const h1s = [...String(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))).filter(Boolean);
  const jsonLdTypes = [...String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((m) => [...m[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((x) => x[1]));
  const internalLinks = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => decode(m[1])).filter((href) => href.startsWith("/") || href.startsWith("https://www.djelvio.nl"));
  const title = text(html, "title");
  const issues = [];
  if (!title) issues.push("missing_title");
  if (!description) issues.push("missing_meta_description");
  if (!canonical) issues.push("missing_canonical");
  if (canonical && canonical.replace(/\/$/, "") !== url.replace(/\/$/, "")) issues.push("canonical_mismatch");
  if (h1s.length !== 1) issues.push(h1s.length ? "multiple_h1" : "missing_h1");
  if (/noindex/i.test(robots || "")) issues.push("noindex");
  return { id: stableId("page", url), url, title, description, canonical, robots, h1s, jsonLdTypes: [...new Set(jsonLdTypes)], internalLinkCount: new Set(internalLinks).size, issues };
}

export async function auditSite({ baseUrl = "https://www.djelvio.nl", fetchImpl = fetch } = {}) {
  const root = await fetchImpl(`${baseUrl}/sitemap.xml`);
  if (!root.ok) throw new Error(`sitemap_http_${root.status}`);
  const childSitemaps = xmlLocations(await root.text());
  const urls = [];
  for (const sitemap of childSitemaps) {
    const response = await fetchImpl(sitemap);
    if (!response.ok) continue;
    urls.push(...xmlLocations(await response.text()));
  }
  const unique = [...new Set(urls)].filter((url) => url.startsWith(baseUrl));
  const pages = [];
  for (const url of unique) {
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok) { pages.push({ id: stableId("page", url), url, status: response.status, issues: [`http_${response.status}`] }); continue; }
    pages.push({ status: response.status, ...inspectHtml(url, await response.text()) });
  }
  const duplicateTitles = Object.entries(Object.groupBy(pages.filter((p) => p.title), (p) => p.title)).filter(([, rows]) => rows.length > 1).map(([title, rows]) => ({ title, urls: rows.map((r) => r.url) }));
  const duplicateDescriptions = Object.entries(Object.groupBy(pages.filter((p) => p.description), (p) => p.description)).filter(([, rows]) => rows.length > 1).map(([description, rows]) => ({ description, urls: rows.map((r) => r.url) }));
  return { baseUrl, collectedAt: new Date().toISOString(), sitemaps: childSitemaps, urlCount: unique.length, pages, duplicateTitles, duplicateDescriptions };
}
