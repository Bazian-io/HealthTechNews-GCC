import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { buildFreeNewsSearches, collectFreeNews, createFreeNewsArticle, matchesGccHealthTech } from "../lib/free-news-collector.mjs";
import { createDraft as createRssDraft } from "../lib/news-collector.mjs";
import { parseArgs, run } from "../scripts/collect-free-news.mjs";

// Synthetic articles only; no live API, database or paid service in these tests.
const collectedAt = "2026-10-10T10:00:00.000Z";
const fixture = [
  { title: "UAE hospital introduces remote patient monitoring", description: "A Dubai hospital introduces a digital health service.", url: "https://example.com/health?id=1&utm_source=news", published_at: "2026-10-09T09:00:00Z", date_source: "jsonld", country: "US", sitename: "Unverified name" },
  { title: "Kuwait hospital expands robotic surgery", url: "https://example.com/health?id=2", published_at: "2026-10-09T08:00:00Z", date_source: "crawled", country: "AE" },
];
const canonicalUrl = "https://example.com/health?id=1";
const json = (results = fixture) => Response.json({ results, strongly_recommended: "UNTRUSTED_EXTRA_FIELD" });
const options = (extra = {}) => ({
  dryRun: true, country: "uae", sleep: async () => {}, now: () => new Date(collectedAt),
  fetchImpl: async () => json(), ...extra,
});

function database(existing = [], failUrl, { failRead = false } = {}) {
  const rows = new Map(existing.map((row) => [row.original_url, row]));
  return {
    rows,
    from(table) {
      assert.equal(table, "articles");
      return {
        // Recent published headlines, read once before saving.
        select(fields) {
          assert.equal(fields, "title, source_name");
          const query = {
            eq(column, value) { assert.deepEqual([column, value], ["status", "published"]); return query; },
            gte(column) { assert.equal(column, "created_at"); return query; },
            async limit() {
              if (failRead) return { data: null, error: { code: "57014", message: "PRIVATE_DETAIL" } };
              return { data: [...rows.values()].filter((row) => row.status === "published"), error: null };
            },
          };
          return query;
        },
        upsert(row, config) {
          assert.deepEqual(config, { onConflict: "original_url", ignoreDuplicates: true });
          return {
            async select(fields) {
              assert.equal(fields, "id");
              if (row.original_url === failUrl) return { data: null, error: { code: "42501", message: "PRIVATE_DETAIL" } };
              if (rows.has(row.original_url)) return { data: [], error: null };
              rows.set(row.original_url, { id: rows.size + 1, ...row });
              return { data: [{ id: rows.size }], error: null };
            },
          };
        },
      };
    },
  };
}

test("searches six GCC countries with text geography and supported API parameters", () => {
  const searches = buildFreeNewsSearches();
  assert.equal(searches.length, 18);
  assert.deepEqual([...new Set(searches.map((s) => s.country))], ["saudi-arabia", "uae", "qatar", "kuwait", "bahrain", "oman"]);
  for (const search of searches) {
    const url = new URL(search.url);
    assert.equal(url.origin, "https://freenewsapi.ai");
    assert.equal(url.pathname, "/v1/search");
    assert.equal(url.searchParams.get("q"), search.query);
    assert.equal(url.searchParams.get("date"), "30d");
    assert.equal(url.searchParams.get("size"), "10");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.equal(url.searchParams.get("full_text"), "true");
    assert.equal(url.searchParams.get("country"), null);
    assert(!/\bOR\b|near\d+:/.test(search.query));
  }
});

test("country and time windows are validated before network access", async () => {
  for (const [days, key, value] of [[1, "date", "24h"], [2, "date", "48h"], [7, "date", "7d"], [3, "from", "now-3d"]]) {
    const searches = buildFreeNewsSearches({ country: "qatar", days });
    assert.equal(searches.length, 3);
    assert.equal(new URL(searches[0].url).searchParams.get(key), value);
  }
  for (const invalid of [{ days: 0 }, { days: 31 }, { days: 1.5 }, { days: "7" }, { country: "__proto__" }]) {
    await assert.rejects(collectFreeNews(options({ ...invalid, fetchImpl: () => assert.fail("Invalid options must not fetch") })));
  }
});

test("publishes with a stable slug and source excerpt, without invented classifications", () => {
  const row = createFreeNewsArticle(fixture[0], collectedAt);
  assert.equal(row.status, "published");
  assert.equal(row.original_url, canonicalUrl);
  assert.match(row.slug, /^uae-hospital-introduces-remote-patient-monitoring-[a-f0-9]{12}$/);
  assert.equal(row.source_name, "example.com");
  assert.equal(row.source_description, fixture[0].description);
  assert.equal(row.published_at, "2026-10-09T09:00:00.000Z");
  for (const field of ["summary", "category", "country"]) assert.equal(row[field], null);
  assert.equal(row.collected_at, collectedAt);
  assert.equal(row.slug, createFreeNewsArticle({ ...fixture[0], url: canonicalUrl }, collectedAt).slug);
});

test("missing, inferred, impossible, and future source dates stay NULL", () => {
  for (const extra of [
    { date_source: undefined }, { date_source: "crawled" }, { date_source: "crawled_clamped" },
    { date_source: "extracted" }, { date_source: "unknown" }, { published_at: "invalid" },
    { published_at: null }, { published_at: "2026-02-30T09:00:00Z" }, { published_at: "2027-01-01T00:00:00Z" },
  ]) assert.equal(createFreeNewsArticle({ ...fixture[0], ...extra }, collectedAt).published_at, null);
  assert.equal(createFreeNewsArticle({ ...fixture[0], date_source: "meta" }, collectedAt).published_at, "2026-10-09T09:00:00.000Z");
  assert.equal(createFreeNewsArticle(fixture[1], collectedAt).source_description, null);
});

test("stores only a quoted opening of the article text, never the full text", () => {
  const opening = Array.from({ length: 18 }, (_, i) => `Dubai clinic sentence ${i + 1} describes the remote monitoring rollout in detail.`).join(" ");
  const text = `${fixture[0].title}\n${opening}\nLATER PARAGRAPH that must not be stored anywhere in the database row.`;
  const row = createFreeNewsArticle({ ...fixture[0], text }, collectedAt);
  const words = row.source_lead.split(/\s+/).length;
  assert(words >= 150 && words <= 200, `${words} words`);
  assert.match(row.source_lead, /^Dubai clinic sentence 1 /);
  assert(!JSON.stringify(row).includes("LATER PARAGRAPH"));
  assert.equal(row.source_description, fixture[0].description);
  for (const text of [undefined, null, "", "Too short to quote."]) {
    assert.equal(createFreeNewsArticle({ ...fixture[0], text }, collectedAt).source_lead, null);
  }
});

test("keeps only public HTTPS publisher image addresses", () => {
  const image = "https://cdn.example.com/photos/lead.jpg?w=1200";
  assert.equal(createFreeNewsArticle({ ...fixture[0], image }, collectedAt).image_url, image);
  assert.equal(createFreeNewsArticle({ ...fixture[0], image: `${image}#top` }, collectedAt).image_url, image);
  for (const invalid of [
    undefined, null, "", 42, "not a url", "http://cdn.example.com/lead.jpg", "data:image/png;base64,AAAA",
    "javascript:alert(1)", "https://user:pass@cdn.example.com/a.jpg", "https://127.0.0.1/a.jpg",
    "https://localhost/a.jpg", "https://cdn.example.com:8443/a.jpg", `https://cdn.example.com/${"a".repeat(2_000)}`,
  ]) assert.equal(createFreeNewsArticle({ ...fixture[0], image: invalid }, collectedAt).image_url, null);
});

test("the basic relevance filter requires GCC story text and healthcare technology", () => {
  for (const title of ["Dubai expands telemedicine", "Kuwait hospital adopts artificial intelligence", "Bahrain launches healthtech startup", "Oman launches digital health platform", "Qatar hospital introduces robotics", "Saudi Arabia funds medical device research"]) {
    assert(matchesGccHealthTech({ title }));
  }
  for (const article of [
    { title: "US hospital adopts AI", country: "AE" },
    { title: "UAE bank expands artificial intelligence services" },
    { title: "Qatar breast cancer awareness campaign" },
    { title: "Oman offers free medical examinations" },
  ]) assert.equal(matchesGccHealthTech(article), false);
});

test("invalid rows and unrelated search hits are counted separately", async () => {
  const result = await collectFreeNews(options({ fetchImpl: async () => json([
    null, [], {}, { ...fixture[0], title: " " }, { ...fixture[0], url: "javascript:alert(1)" },
    { title: "US hospital uses AI", url: "https://example.com/us", country: "AE" }, fixture[0],
  ]) }));
  assert.equal(result.found, 21);
  assert.equal(result.invalid, 15);
  assert.equal(result.filtered, 3);
  assert.equal(result.previewed, 1);
  assert.equal(result.duplicates, 2);
});

test("real collection publishes only new rows and preserves existing drafts and published articles", async () => {
  for (const status of ["draft", "published"]) {
    const existing = { original_url: canonicalUrl, status, title: "Edited title", summary: "Reviewed summary", slug: "existing" };
    const db = database([existing]);
    const result = await collectFreeNews(options({ dryRun: false, supabase: db }));
    assert.equal(result.saved, 1);
    assert.equal(result.duplicates, 5);
    assert.deepEqual(db.rows.get(canonicalUrl), existing);
    assert.equal(db.rows.get(fixture[1].url).status, "published");
    const before = structuredClone([...db.rows.values()]);
    const repeat = await collectFreeNews(options({ dryRun: false, supabase: db }));
    assert.equal(repeat.saved, 0);
    assert.deepEqual([...db.rows.values()], before);
  }
});

test("AMP copies normalize to the regular article address", () => {
  const url = (value) => createFreeNewsArticle({ ...fixture[0], url: value }, collectedAt).original_url;
  assert.equal(url("https://www.business-standard.com/amp/content/clinics-126102601329_1.html"), "https://www.business-standard.com/content/clinics-126102601329_1.html");
  assert.equal(url("https://example.com/news/story/amp/?amp=1&id=2"), "https://example.com/news/story/?id=2");
  assert.equal(url("https://example.com/news/story?outputType=amp"), "https://example.com/news/story");
  assert.equal(url("https://example.com/AMP"), "https://example.com/");
  // Words that merely contain "amp" are part of the real address.
  assert.equal(url("https://example.com/ampere/Champions?amplify=1"), "https://example.com/ampere/Champions?amplify=1");
});

test("skips republished copies of a story already published recently", async () => {
  const title = "Dubai hospital adopts digital health platform for remote patient care";
  const existing = { original_url: "https://www.business-standard.com/content/story.html", status: "published", title, source_name: "www.business-standard.com" };
  const db = database([existing]);
  const copy = { ...fixture[0], title: `${title} - The Tribune`, url: "https://www.tribuneindia.com/news/story/" };
  const result = await collectFreeNews(options({ dryRun: false, supabase: db, fetchImpl: async () => json([copy]) }));
  assert.equal(result.saved, 0);
  assert.equal(result.sameStory, 3);
  assert.equal(result.duplicates, 3);
  assert.equal(db.rows.size, 1);
});

test("keeps only the first copy of a story found twice in one run", async () => {
  const title = "Abu Dhabi hospital launches telemedicine service for rural patients";
  const copies = [
    { ...fixture[0], title, url: "https://a.example.com/story" },
    { ...fixture[0], title: title.toUpperCase(), url: "https://b.example.com/story" },
  ];
  const db = database();
  const result = await collectFreeNews(options({ dryRun: false, supabase: db, fetchImpl: async () => json(copies) }));
  assert.equal(result.saved, 1);
  assert.equal(result.sameStory, 5);
  assert.deepEqual([...db.rows.keys()], ["https://a.example.com/story"]);
  const preview = await collectFreeNews(options({ fetchImpl: async () => json(copies) }));
  assert.equal(preview.previewed, 1);
});

test("a failed headline read is reported without stopping publication", async () => {
  const db = database([], undefined, { failRead: true });
  const result = await collectFreeNews(options({ dryRun: false, supabase: db }));
  assert.equal(result.saved, 2);
  assert(result.issues.some((issue) => issue.startsWith("Could not read recent published headlines")));
  assert(!JSON.stringify(result).includes("PRIVATE_DETAIL"));
});

test("RSS URL identities still match while RSS remains draft-only", () => {
  const article = { ...fixture[0], url: "http://moh.gov.sa/en/News.aspx?utm_source=x#top" };
  const rss = createRssDraft({ title: article.title, link: article.url }, collectedAt);
  const free = createFreeNewsArticle(article, collectedAt);
  assert.equal(rss.original_url, free.original_url);
  assert.equal(rss.slug, free.slug);
  assert.equal(rss.status, "draft");
  assert.equal(free.status, "published");
});

test("dry runs never access Supabase and ignore unrelated API metadata", async () => {
  const result = await collectFreeNews(options({ supabase: { from() { assert.fail("No database access"); } } }));
  assert.equal(result.saved, 0);
  assert.equal(result.previewed, 2);
  assert.equal(result.preview[0].original_url, canonicalUrl);
  assert.equal(result.publicationStatus, "published");
  assert(!JSON.stringify(result).includes("UNTRUSTED_EXTRA_FIELD"));
});

test("valid empty lists succeed; malformed JSON and unsupported response shapes fail", async () => {
  const empty = await collectFreeNews(options({ fetchImpl: async () => json([]) }));
  assert.equal(empty.found, 0);
  assert.equal(empty.searches.succeeded, 3);
  for (const body of ["", "<html>Unavailable</html>", "null", "{}", '{"results":{}}', '{"error":"PRIVATE_DETAIL"}']) {
    const result = await collectFreeNews(options({ fetchImpl: async () => new Response(body) }));
    assert.equal(result.searches.failed, 3);
    assert.equal(result.requests, 3);
    assert(!JSON.stringify(result).includes("PRIVATE_DETAIL"));
  }
});

test("response and result-count limits prevent oversized imports", async () => {
  for (const fetchImpl of [async () => new Response("x".repeat(2 * 1024 * 1024 + 1)), async () => json(Array(11).fill(fixture[0]))]) {
    const db = database();
    const result = await collectFreeNews(options({ dryRun: false, supabase: db, fetchImpl }));
    assert.equal(result.searches.failed, 3);
    assert.equal(db.rows.size, 0);
  }
});

test("capped result sets warn without claiming exhaustive coverage", async () => {
  const result = await collectFreeNews(options({ fetchImpl: async () => json(Array(10).fill(fixture[0])) }));
  assert.equal(result.previewed, 1);
  assert.match(result.issues[0], /not exhaustive/);
});

test("requests are sequential, paced, and bounded by a timeout", async () => {
  const events = [];
  await collectFreeNews(options({
    sleep: async (ms) => events.push(ms),
    fetchImpl: async (url, init) => {
      events.push("fetch");
      assert.equal(init.headers.Accept, "application/json");
      assert.equal(init.redirect, "error");
      assert(init.signal instanceof AbortSignal);
      return json([]);
    },
  }));
  assert.deepEqual(events, ["fetch", 1000, "fetch", 1000, "fetch"]);
});

test("temporary 429 retries once, honoring seconds and HTTP-date Retry-After", async () => {
  for (const retryAfter of ["5", "Sat, 10 Oct 2026 10:00:05 GMT"]) {
    const waits = [];
    let calls = 0;
    const result = await collectFreeNews(options({
      sleep: async (ms) => waits.push(ms),
      fetchImpl: async () => ++calls === 1 ? new Response("Busy", { status: 429, headers: { "Retry-After": retryAfter } }) : json([]),
    }));
    assert.equal(result.searches.succeeded, 3);
    assert.deepEqual(waits, [5000, 1000, 1000]);
  }
});

test("persistent rate limiting stops the run after its retry", async () => {
  const waits = [];
  const result = await collectFreeNews(options({ country: undefined, sleep: async (ms) => waits.push(ms), fetchImpl: async () => new Response("Busy", { status: 429 }) }));
  assert.equal(result.requests, 2);
  assert.deepEqual(waits, [2000]);
  assert.deepEqual(result.searches, { planned: 18, succeeded: 0, failed: 1, skipped: 17 });
});

test("long cooldowns stop without an early retry", async () => {
  const result = await collectFreeNews(options({
    sleep: () => assert.fail("No early retry"),
    fetchImpl: async () => new Response("Busy", { status: 503, headers: { "Retry-After": "31" } }),
  }));
  assert.equal(result.requests, 1);
  assert.equal(result.searches.skipped, 2);
});

test("a final server cooldown carries over to the next independent search", async () => {
  const waits = [];
  let calls = 0;
  const result = await collectFreeNews(options({
    sleep: async (ms) => waits.push(ms),
    fetchImpl: async () => ++calls <= 2 ? new Response("Busy", { status: 503, headers: { "Retry-After": "5" } }) : json([]),
  }));
  assert.equal(result.searches.failed, 1);
  assert.deepEqual(waits, [5000, 5000, 1000]);
});

test("network and server errors retry once without exposing private error details", async () => {
  for (const fetchImpl of [async () => { throw new Error("PRIVATE_CONNECTION"); }, async () => new Response("PRIVATE_BODY", { status: 502 })]) {
    const result = await collectFreeNews(options({ fetchImpl }));
    assert.equal(result.requests, 6);
    assert.equal(result.searches.failed, 3);
    assert(!JSON.stringify(result).includes("PRIVATE_"));
  }
});

test("timeouts abort and non-retryable HTTP failures do not retry", async () => {
  const timedOut = await collectFreeNews(options({ requestTimeoutMs: 1, fetchImpl: async (url, { signal }) => {
    await delay(10);
    assert.equal(signal.aborted, true);
    throw signal.reason;
  } }));
  assert.equal(timedOut.requests, 6);
  const badRequest = await collectFreeNews(options({ fetchImpl: async () => new Response("Bad request", { status: 400 }) }));
  assert.equal(badRequest.requests, 3);
});

test("partial search failures preserve successfully published results and report failure", async () => {
  let calls = 0;
  const db = database();
  const result = await collectFreeNews(options({ dryRun: false, supabase: db, fetchImpl: async () => ++calls === 1 ? json() : new Response("Busy", { status: 429 }) }));
  assert.equal(result.saved, 2);
  assert.equal(result.searches.failed, 1);
  assert.equal(result.searches.skipped, 1);
  assert([...db.rows.values()].every((row) => row.status === "published"));
});

test("database failures are separate from search failures", async () => {
  const db = database([], canonicalUrl);
  const result = await collectFreeNews(options({ dryRun: false, supabase: db }));
  assert.equal(result.failed, 1);
  assert.equal(result.saved, 1);
  assert.equal(result.searches.failed, 0);
  assert(!JSON.stringify(result).includes("PRIVATE_DETAIL"));
  await assert.rejects(collectFreeNews(), /backend Supabase client/);
});

test("CLI validates options before credentials are read", async () => {
  assert.deepEqual(parseArgs(["--dry-run", "--country", "oman", "--days", "7"]), { dryRun: true, country: "oman", days: 7 });
  for (const args of [["--country"], ["--country", "unknown"], ["--days", "31"], ["--days", "0"], ["--days", "1.5"], ["--draft"]]) {
    await assert.rejects(run(args, { loadEnv: () => assert.fail("Invalid options must not load credentials") }));
  }
});

test("CLI dry run and help do not read credentials or create a database client", async () => {
  const output = [];
  const deps = {
    loadEnv: () => assert.fail("No credential reads"), createClient: () => assert.fail("No client"),
    collect: (args) => collectFreeNews(options(args)), print: (message) => output.push(message), progress: () => {},
  };
  assert.equal(await run(["--dry-run", "--country", "uae"], deps), 0);
  assert.equal(JSON.parse(output[0]).saved, 0);
  assert.equal(await run(["--help"], { ...deps, collect: () => assert.fail("Help must not fetch") }), 0);
});

test("CLI real runs use the backend client and incomplete runs exit nonzero", async () => {
  for (const failure of ["database", "search", "skipped"]) {
    const events = [];
    const exit = await run([], {
      loadEnv: () => events.push("env"), createClient: () => { events.push("client"); return "backend"; },
      collect: async ({ supabase, dryRun }) => {
        assert.equal(supabase, "backend"); assert.equal(dryRun, false); events.push("collect");
        return { failed: failure === "database" ? 1 : 0, searches: { failed: failure === "search" ? 1 : 0, skipped: failure === "skipped" ? 1 : 0 } };
      }, print: () => {}, progress: () => {},
    });
    assert.equal(exit, 1);
    assert.deepEqual(events, ["env", "client", "collect"]);
  }
});
