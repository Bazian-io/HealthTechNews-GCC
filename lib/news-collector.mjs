import Parser from "rss-parser";
import { makeDraft, normalizeUrl, saveDrafts } from "./collector-utils.mjs";

// Preserve existing imports used by the collector, draft listing, and relevance CLI.
export { createCollectorClient } from "./collector-utils.mjs";

export const SOURCE_NAME = "Saudi Ministry of Health";
export const FEED_URL =
  "https://www.moh.gov.sa/_Layouts/moh/RssGenerator.aspx?" +
  "DescriptionField=BriefDesc&ListUrl=En%2FMinistry%2FMediaCenter%2FNews%2FPages%2F" +
  "&RssDescription=&RssTitle=&ViewName=RSSView" +
  "&WebSiteUrl=%2FEn%2FMinistry%2FMediaCenter%2FNews%2F";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 100;
const parser = new Parser();

export function normalizeArticleUrl(value) {
  return normalizeUrl(value, { mohOnly: true });
}

export function createDraft(item, collectedAt) {
  return makeDraft({
    title: item.title,
    originalUrl: normalizeArticleUrl(item.link),
    publishedAt: item.isoDate || item.pubDate,
    sourceName: SOURCE_NAME,
    sourceDescription: item.contentSnippet,
  }, collectedAt);
}

async function readFeed(fetchImpl) {
  let xml;
  try {
    const response = await fetchImpl(FEED_URL, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "GCC-HealthTech-News/0.1 (RSS collector)",
      },
    });
    if (!response.ok || !response.body) throw new Error("Feed unavailable");

    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_FEED_BYTES) throw new Error("Feed too large");
      chunks.push(chunk);
    }
    xml = Buffer.concat(chunks).toString("utf8");
  } catch {
    throw new Error("Could not download the news feed. Check the source or connection and try again.");
  }

  try {
    const feed = await parser.parseString(xml);
    if (feed.items.length > MAX_ITEMS) throw new Error("Unexpected feed size");
    return feed.items;
  } catch {
    throw new Error("The source did not return a supported feed of at most 100 articles.");
  }
}

export async function collectNews({ supabase, dryRun = false, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!dryRun && !supabase) throw new Error("A backend Supabase client is required to save articles.");
  const items = await readFeed(fetchImpl);
  const collectedAt = now().toISOString();
  return saveDrafts(items.map((item) => createDraft(item, collectedAt)), {
    source: SOURCE_NAME, supabase, dryRun,
  });
}
