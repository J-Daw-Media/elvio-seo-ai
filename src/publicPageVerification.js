export async function verifyPublicArticle({ url, expected, fetchImpl = fetch } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["www.djelvio.nl", "djelvio.nl"].includes(parsed.hostname)) throw new Error("PUBLIC_ARTICLE_HOST_INVALID");
  const response = await fetchImpl(url, { method: "GET", redirect: "follow" });
  if (!response.ok) throw new Error(`PUBLIC_ARTICLE_HTTP_${response.status}`);
  const html = await response.text();
  const checks = {
    title: html.includes(`<title>${expected.seoTitle}</title>`),
    canonical: html.includes(`rel="canonical"`) && html.includes(expected.canonicalUrl),
    h1: html.includes(`<h1`) && html.includes(expected.h1),
    cta: html.includes(expected.ctaUrl),
    image: html.includes(expected.imageIdentity),
    indexable: !/noindex/i.test(html),
  };
  return { verified: Object.values(checks).every(Boolean), checks, url: response.url || url };
}
