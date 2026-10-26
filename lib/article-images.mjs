// Browser-safe helpers for publisher-hosted article images. The collector has
// its own stricter server-side check before an address is stored.

export const FEATURED_CANDIDATES = 4;
// Publishers sometimes send a logo or icon instead of a lead photo.
export const MIN_IMAGE_WIDTH = 300;

export function safeImageUrl(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 2_000) return null;

  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return text;
  } catch {
    return null;
  }
}

// Top stories keep newest-first order; only the featured slot prefers a story
// with an image among the same latest few.
export function pickFeaturedIndex(articles, candidates = FEATURED_CANDIDATES) {
  const index = articles
    .slice(0, candidates)
    .findIndex((article) => safeImageUrl(article?.image_url));
  return index === -1 ? 0 : index;
}

export function isUsableImageWidth(width) {
  return Number.isFinite(width) && width >= MIN_IMAGE_WIDTH;
}

export function publisherInitial(sourceName) {
  if (typeof sourceName !== "string") return null;
  const name = sourceName.trim().toLocaleLowerCase().replace(/^www\./, "");
  const initial = name.match(/[\p{L}\p{N}]/u)?.[0];
  return initial ? initial.toLocaleUpperCase() : null;
}
