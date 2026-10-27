// Recognize the same story published at different addresses, such as AMP
// copies or one press release republished by several publishers. Matching is
// deliberately exact after normalization; similar headlines are not merged.

const MIN_WORDS = 4;
// Only " - Name", " | Name", and dash variants with surrounding spaces.
const TRAILING_SEGMENT = /\s+[-–—|]\s+([^-–—|]+)$/u;

function compact(value) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// "Story - The Tribune" from tribuneindia.com: the ending names the publisher.
function namesPublisher(segment, sourceName) {
  if (typeof sourceName !== "string") return false;
  const host = compact(sourceName.replace(/^www\./i, ""));
  const name = compact(segment.replace(/^\s*the\s+/i, ""));
  return name.length >= 3 && host.includes(name);
}

export function storyFingerprint(title, sourceName) {
  if (typeof title !== "string") return null;
  let text = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
  const ending = text.match(TRAILING_SEGMENT);
  if (ending && namesPublisher(ending[1], sourceName)) {
    text = text.slice(0, ending.index);
  }
  const words = text.toLocaleLowerCase().replace(/&/g, " and ").match(/[\p{L}\p{N}]+/gu) ?? [];
  // Very short headlines are too generic to treat as the same story.
  return words.length >= MIN_WORDS ? words.join(" ") : null;
}

// Rows saved before the collector normalized AMP addresses may still use them.
function isAmpUrl(value) {
  return typeof value === "string" && /\/amp(?:[/?#]|$)|[?&](?:amp|outputType=amp)(?:[=&#]|$)/i.test(value);
}

// Input is newest first. Each story appears once, at its chosen copy's position:
// the earliest-added copy with an image, otherwise the earliest-added copy.
// Other copies' publishers are listed in also_covered_by.
export function groupSameStories(articles) {
  const groups = new Map();
  for (const article of articles) {
    const key = storyFingerprint(article.title, article.source_name) ?? `id:${article.id}`;
    const group = groups.get(key);
    if (group) group.push(article);
    else groups.set(key, [article]);
  }

  // "www.example.com" and "example.com" are the same publisher.
  const publisherKey = (name) => name?.trim().toLocaleLowerCase().replace(/^www\./, "") || null;
  const chosen = new Map();
  for (const group of groups.values()) {
    const oldestFirst = [...group].reverse();
    // Prefer an image, then a regular page over an AMP copy saved earlier.
    const lead = oldestFirst.find((article) => article.image_url && !isAmpUrl(article.original_url))
      ?? oldestFirst.find((article) => article.image_url)
      ?? oldestFirst.find((article) => !isAmpUrl(article.original_url))
      ?? oldestFirst[0];
    const others = new Map();
    for (const article of group) {
      const key = publisherKey(article.source_name);
      if (key && key !== publisherKey(lead.source_name) && !others.has(key)) {
        others.set(key, article.source_name.trim());
      }
    }
    chosen.set(lead, [...others.values()]);
  }

  return articles
    .filter((article) => chosen.has(article))
    .map((article) => ({ ...article, also_covered_by: chosen.get(article) }));
}
