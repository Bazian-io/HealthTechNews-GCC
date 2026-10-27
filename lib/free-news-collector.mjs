import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { extractLead } from "./article-text.mjs";
import { cleanText, makeDraft, normalizeUrl, saveArticles } from "./collector-utils.mjs";

export const FREE_NEWS_ENDPOINT = "https://freenewsapi.ai/v1/search";
export const FREE_NEWS_COUNTRIES = {
  "saudi-arabia": "Saudi",
  uae: "UAE",
  qatar: "Qatar",
  kuwait: "Kuwait",
  bahrain: "Bahrain",
  oman: "Oman",
};
const TOPICS = ["digital health", "telemedicine", "medical AI"];
const MAX_RESULTS = 10;
const REQUEST_GAP_MS = 1_000;
const RETRY_DELAY_MS = 2_000;
const MAX_RETRY_WAIT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// A small, deliberately transparent filter, not a claim of verified relevance.
// Use story text; an API's publisher-country field is not story geography.
const GCC = /\b(?:Saudi(?: Arabia)?|Riyadh|Jeddah|UAE|U\.?A\.?E\.?|United Arab Emirates|Emirati|Dubai|Abu Dhabi|Sharjah|Qatar|Qatari|Doha|Kuwait|Kuwaiti|Bahrain|Bahraini|Manama|Oman|Omani|Muscat)\b/i;
const HEALTH_TECH = /\b(?:health[ -]?tech|med[ -]?tech|digital health(?:care)?|telemedicine|telehealth|telerehabilitation|medical devices?|robotic surgery|remote surgery|remote patient monitoring|electronic (?:health|medical) records?|precision medicine|genomics)\b/i;
const HEALTH = /\b(?:health(?:care)?|medical|clinical|hospitals?|patients?)\b/i;
const TECHNOLOGY = /\b(?:AI|artificial intelligence|robotics?|technology|technologies|innovation|startups?)\b/i;

export function matchesGccHealthTech(article) {
  const text = `${cleanText(article?.title)} ${cleanText(article?.description)}`;
  return GCC.test(text) && (HEALTH_TECH.test(text) || (HEALTH.test(text) && TECHNOLOGY.test(text)));
}

export function buildFreeNewsSearches({ country, days = 30 } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error("Days must be a whole number between 1 and 30.");
  }
  if (country !== undefined && !Object.hasOwn(FREE_NEWS_COUNTRIES, country)) {
    throw new Error(`Country must be one of: ${Object.keys(FREE_NEWS_COUNTRIES).join(", ")}.`);
  }
  return Object.entries(FREE_NEWS_COUNTRIES)
    .filter(([id]) => country === undefined || id === country)
    .flatMap(([id, geography]) => TOPICS.map((topic) => {
      // This API uses AND between words, not GDELT's boolean query syntax.
      const query = `${geography} ${topic}`;
      const params = new URLSearchParams({
        // Full text is read only to quote its opening; the rest is discarded.
        q: query, lang: "en", size: String(MAX_RESULTS), sort: "relevance", full_text: "true",
      });
      const presets = { 1: "24h", 2: "48h", 7: "7d", 30: "30d" };
      if (presets[days]) params.set("date", presets[days]);
      else params.set("from", `now-${days}d`);
      return { country: id, query, url: `${FREE_NEWS_ENDPOINT}?${params}` };
    }));
}

// Readers load this image directly from the publisher, so only public HTTPS
// addresses are kept; anything else stays NULL and the website shows a fallback.
export function normalizeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      !url.hostname.includes(".") || isIP(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)
    ) return null;
    url.hash = "";
    return url.href.length <= 2_000 ? url.href : null;
  } catch {
    return null;
  }
}

export function createFreeNewsArticle(article, collectedAt) {
  if (!article || typeof article !== "object" || Array.isArray(article)) return null;
  const originalUrl = normalizeUrl(article.url);
  // Live responses sometimes omit date_source. A date without provenance, or a
  // crawl-time fallback, must not be presented as a publisher's publication date.
  const date = typeof article.published_at === "string" ? new Date(article.published_at) : null;
  const hasSourceDate = ["jsonld", "meta"].includes(article.date_source)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(article.published_at)
    && date && Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 19) === article.published_at.slice(0, 19)
    && date <= new Date(collectedAt);
  const row = makeDraft({
    title: article.title,
    originalUrl,
    sourceName: originalUrl ? new URL(originalUrl).hostname : null,
    sourceDescription: cleanText(article.description).slice(0, 2_000),
    publishedAt: hasSourceDate ? date.toISOString() : null,
  }, collectedAt);
  // Explicit product choice: only this collector publishes immediately. RSS and
  // GDELT retain their existing draft-only behavior.
  return row
    ? {
      ...row,
      status: "published",
      image_url: normalizeImageUrl(article.image),
      source_lead: extractLead(article.text, row.title),
    }
    : null;
}

class FreeNewsError extends Error {
  constructor(message, { retryable = false, stop = false, retryAfterMs = 0 } = {}) {
    super(message);
    this.retryable = retryable;
    this.stop = stop;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(value, now) {
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now().getTime());
}

async function readResults(url, { fetchImpl, now, requestTimeoutMs }) {
  let response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(requestTimeoutMs), redirect: "error",
      headers: { Accept: "application/json", "User-Agent": "GCC-HealthTech-News/0.1 (news discovery)" },
    });
  } catch {
    throw new FreeNewsError("FreeNewsAPI request failed or timed out.", { retryable: true });
  }
  if (!response.ok) {
    const wait = retryAfterMs(response.headers.get("retry-after"), now);
    await response.body?.cancel().catch(() => {});
    throw new FreeNewsError(`FreeNewsAPI returned HTTP ${response.status}.`, {
      retryable: response.status === 429 || response.status >= 500,
      stop: response.status === 429, retryAfterMs: wait,
    });
  }
  if (!response.body) throw new FreeNewsError("FreeNewsAPI returned an empty response body.");
  let body;
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) throw new FreeNewsError("FreeNewsAPI response exceeded 2 MiB.");
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    if (error instanceof FreeNewsError) throw error;
    throw new FreeNewsError("FreeNewsAPI response was interrupted or timed out.", { retryable: true });
  }
  let data;
  try { data = JSON.parse(body); }
  catch { throw new FreeNewsError("FreeNewsAPI did not return valid JSON."); }
  if (!data || !Array.isArray(data.results) || data.results.length > MAX_RESULTS) {
    throw new FreeNewsError("FreeNewsAPI returned an unsupported search response.");
  }
  // Ignore all other response fields. Only whitelisted article metadata is used.
  return data.results;
}

export async function collectFreeNews({
  supabase, dryRun = false, country, days = 30,
  fetchImpl = fetch, sleep = delay, now = () => new Date(), requestTimeoutMs = 15_000,
} = {}) {
  if (!dryRun && !supabase) throw new Error("A backend Supabase client is required to save articles.");
  const searches = buildFreeNewsSearches({ country, days });
  const collectedAt = now().toISOString();
  const articles = [];
  const queries = [];
  const issues = [];
  let requests = 0;
  let found = 0;
  let filtered = 0;
  let nextWait = REQUEST_GAP_MS;
  let stopped = false;

  for (const search of searches) {
    let wait = nextWait;
    nextWait = REQUEST_GAP_MS;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (requests > 0) await sleep(wait);
      requests++;
      try {
        const results = await readResults(search.url, { fetchImpl, now, requestTimeoutMs });
        found += results.length;
        queries.push({ country: search.country, query: search.query, status: "ok", found: results.length });
        if (results.length === MAX_RESULTS) issues.push(`${search.query}: reached ${MAX_RESULTS} results; this is a sample, not exhaustive coverage.`);
        for (const item of results) {
          const row = createFreeNewsArticle(item, collectedAt);
          if (!row) articles.push(null);
          else if (matchesGccHealthTech(item)) articles.push(row);
          else filtered++;
        }
        break;
      } catch (error) {
        const longCooldown = error.retryAfterMs > MAX_RETRY_WAIT_MS;
        if (error.retryable && attempt === 0 && !longCooldown) {
          wait = Math.max(RETRY_DELAY_MS, error.retryAfterMs);
          continue;
        }
        const message = error instanceof FreeNewsError ? error.message : "FreeNewsAPI search failed.";
        queries.push({ country: search.country, query: search.query, status: "failed", error: message });
        issues.push(`${search.query}: ${message}`);
        nextWait = Math.max(REQUEST_GAP_MS, error.retryAfterMs || 0);
        stopped = error.stop || longCooldown;
        if (longCooldown) issues.push("Server requested a cooldown longer than 30 seconds; remaining searches skipped.");
        break;
      }
    }
    if (stopped) break;
  }
  const result = await saveArticles(articles, { source: "FreeNewsAPI.ai", supabase, dryRun, previewLimit: 10 });
  return {
    ...result, found, filtered, publicationStatus: "published", requests,
    searches: {
      planned: searches.length,
      succeeded: queries.filter((q) => q.status === "ok").length,
      failed: queries.filter((q) => q.status === "failed").length,
      skipped: searches.length - queries.length,
    },
    queries, issues: [...issues, ...result.issues],
  };
}
