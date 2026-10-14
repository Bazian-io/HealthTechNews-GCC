import { setTimeout as delay } from "node:timers/promises";
import { makeDraft, normalizeUrl, saveDrafts } from "./collector-utils.mjs";

export const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
export const COUNTRIES = {
  "saudi-arabia": '("Saudi Arabia" OR Saudi OR Riyadh OR Jeddah)',
  uae: '("United Arab Emirates" OR UAE OR Emirati OR Dubai OR "Abu Dhabi" OR Sharjah)',
  qatar: "(Qatar OR Qatari OR Doha)",
  kuwait: "(Kuwait OR Kuwaiti)",
  bahrain: "(Bahrain OR Bahraini OR Manama)",
  oman: "(Oman OR Omani OR Muscat)",
};
const TOPICS = {
  technology: '(healthtech OR medtech OR "digital health" OR telemedicine OR telehealth OR "medical devices" OR "medical AI" OR "healthcare AI" OR "robotic surgery")',
  // Require healthcare context near sector terms. Independent broad word groups
  // also matched unrelated news roundups in the initial live evaluation.
  sector: '(near8:"healthcare investment" OR near8:"healthcare partnership" OR near8:"health startup" OR near8:"medical innovation" OR near8:"healthcare technology")',
};
const MAX_RECORDS = 75;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_GAP_MS = 30_000;
const RETRY_DELAY_MS = 60_000;
const MAX_RETRY_WAIT_MS = 60_000;

export function buildGdeltSearches({ country, days = 7 } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("Days must be a whole number between 1 and 90.");
  }
  if (country !== undefined && !Object.hasOwn(COUNTRIES, country)) {
    throw new Error(`Country must be one of: ${Object.keys(COUNTRIES).join(", ")}.`);
  }
  return Object.entries(COUNTRIES)
    .filter(([id]) => country === undefined || id === country)
    .flatMap(([id, geography]) => Object.entries(TOPICS).map(([topic, terms]) => {
      // Geography is mentioned in the story; sourcecountry is deliberately unused.
      // English terms also search GDELT's translated coverage in other languages.
      const query = `${geography} ${terms}`;
      const params = new URLSearchParams({
        query, mode: "artlist", format: "json", timespan: `${days}d`,
        maxrecords: String(MAX_RECORDS), sort: "datedesc",
      });
      return { country: id, topic, query, url: `${GDELT_ENDPOINT}?${params}` };
    }));
}

export function createGdeltDraft(article, collectedAt) {
  if (!article || typeof article !== "object" || Array.isArray(article)) return null;
  const originalUrl = normalizeUrl(article.url);
  return makeDraft({
    title: article.title,
    originalUrl,
    sourceName: originalUrl ? new URL(originalUrl).hostname : null,
    // DOC article lists provide discovery metadata, not full text or summaries.
    // seendate is not a verified publisher date; sourcecountry is not story geography.
    publishedAt: null,
    sourceDescription: null,
  }, collectedAt);
}

class GdeltError extends Error {
  constructor(message, { retryable = false, stop = false, retryAfterMs = 0 } = {}) {
    super(message);
    this.retryable = retryable;
    this.stop = stop;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMilliseconds(value, now) {
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now().getTime());
}

async function readArticles(url, { fetchImpl, now, requestTimeoutMs }) {
  const signal = AbortSignal.timeout(requestTimeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      signal,
      headers: { Accept: "application/json", "User-Agent": "GCC-HealthTech-News/0.1 (GDELT discovery)" },
      // An upstream redirect must not turn this into an arbitrary-page fetch.
      redirect: "error",
    });
  } catch {
    throw new GdeltError("GDELT request failed or timed out.", { retryable: true });
  }
  if (!response.ok) {
    const retryAfterMs = retryAfterMilliseconds(response.headers.get("retry-after"), now);
    await response.body?.cancel().catch(() => {});
    const rateLimited = response.status === 429;
    throw new GdeltError(
      rateLimited ? "GDELT rate limit (HTTP 429); try again later." : `GDELT returned HTTP ${response.status}.`,
      { retryable: rateLimited || response.status >= 500, stop: rateLimited, retryAfterMs },
    );
  }
  if (!response.body) throw new GdeltError("GDELT returned an empty response body.");
  let text;
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) throw new GdeltError("GDELT response exceeded 2 MiB.");
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    if (error instanceof GdeltError) throw error;
    throw new GdeltError("GDELT response was interrupted or timed out.", { retryable: true });
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Never mistake a plain-text API error for a successful empty search.
    if (/^(Your query was too short or too long|One or more of your keywords were too short, too long or too common)/.test(text.trim())) {
      throw new GdeltError("GDELT rejected the query length or keywords.");
    }
    throw new GdeltError("GDELT did not return valid JSON.");
  }
  if (!data || !Array.isArray(data.articles) || data.articles.length > MAX_RECORDS) {
    throw new GdeltError("GDELT returned an unsupported article-list response.");
  }
  return data.articles;
}

export async function collectGdeltNews({
  supabase, dryRun = false, country, days = 7,
  fetchImpl = fetch, sleep = delay, now = () => new Date(), requestTimeoutMs = 20_000,
} = {}) {
  if (!dryRun && !supabase) throw new Error("A backend Supabase client is required to save articles.");
  const searches = buildGdeltSearches({ country, days });
  const collectedAt = now().toISOString();
  const drafts = [];
  const queries = [];
  const issues = [];
  let requests = 0;
  let stopped = false;
  let nextRequestWaitMs = REQUEST_GAP_MS;

  for (const search of searches) {
    let retryWaitMs = nextRequestWaitMs;
    nextRequestWaitMs = REQUEST_GAP_MS;
    for (let attempt = 0; attempt < 2; attempt++) {
      // Conservative per-process pacing applies to retries and separate queries.
      if (requests > 0) await sleep(retryWaitMs);
      requests++;
      try {
        const articles = await readArticles(search.url, { fetchImpl, now, requestTimeoutMs });
        const capped = articles.length === MAX_RECORDS;
        queries.push({ country: search.country, topic: search.topic, query: search.query, status: "ok", found: articles.length, capped });
        if (capped) issues.push(`${search.country}/${search.topic}: reached ${MAX_RECORDS} results; more may exist. Try a shorter --days window.`);
        drafts.push(...articles.map((article) => createGdeltDraft(article, collectedAt)));
        break;
      } catch (error) {
        // Long Retry-After values stop this run rather than retrying too early.
        const longCooldown = error.retryAfterMs > MAX_RETRY_WAIT_MS;
        if (error.retryable && attempt === 0 && !longCooldown) {
          retryWaitMs = Math.max(RETRY_DELAY_MS, error.retryAfterMs);
          continue;
        }
        const message = error instanceof GdeltError ? error.message : "GDELT search failed.";
        queries.push({ country: search.country, topic: search.topic, query: search.query, status: "failed", error: message });
        issues.push(`${search.country}/${search.topic}: ${message}`);
        // Even after exhausting this query's retries, a server cooldown applies
        // to the next query too (not only another attempt at the same URL).
        nextRequestWaitMs = Math.max(REQUEST_GAP_MS, error.retryAfterMs || 0);
        if (longCooldown) issues.push("Server requested a cooldown longer than the 60-second retry budget; remaining searches skipped.");
        stopped = error.stop || longCooldown;
        break;
      }
    }
    // Persistent rate limits stop further requests. Already discovered rows are
    // still processed, and the CLI reports this run as incomplete with exit 1.
    if (stopped) break;
  }

  const result = await saveDrafts(drafts, { source: "GDELT", supabase, dryRun, previewLimit: 10 });
  return {
    ...result,
    requests,
    searches: {
      planned: searches.length,
      succeeded: queries.filter((query) => query.status === "ok").length,
      failed: queries.filter((query) => query.status === "failed").length,
      skipped: searches.length - queries.length,
      capped: queries.filter((query) => query.capped).length,
    },
    queries,
    issues: [...issues, ...result.issues],
  };
}
