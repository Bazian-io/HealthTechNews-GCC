import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { normalizeUrl } from "../lib/collector-utils.mjs";
import { createDraft as createRssDraft } from "../lib/news-collector.mjs";
import { buildGdeltSearches, collectGdeltNews, createGdeltDraft } from "../lib/gdelt-collector.mjs";
import { parseArgs, run } from "../scripts/collect-gdelt.mjs";

// Synthetic metadata only; these tests never call GDELT, Supabase, or an AI API.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/gdelt-articles.json", import.meta.url), "utf8"));
const collectedAt = "2026-10-08T10:00:00.000Z";
const canonicalUrl = "https://news.example.com/saudi-telemedicine?story=7";
const mohUrl = "https://www.moh.gov.sa/en/Ministry/MediaCenter/News/Pages/example.aspx";
const json = (articles = []) => Response.json({ articles });
const options = (extra = {}) => ({
  dryRun: true, country: "saudi-arabia", sleep: async () => {},
  now: () => new Date(collectedAt), fetchImpl: async () => json(fixture.articles), ...extra,
});

function database(existing = [], failUrl) {
  const rows = new Map(existing.map((row) => [row.original_url, row]));
  return {
    rows,
    from(table) {
      assert.equal(table, "articles");
      return {
        upsert(row, config) {
          assert.deepEqual(config, { onConflict: "original_url", ignoreDuplicates: true });
          return {
            async select(columns) {
              assert.equal(columns, "id");
              if (row.original_url === failUrl) return { data: null, error: { code: "42501", message: "SECRET_DETAIL" } };
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

test("searches all six countries using story geography and two complementary topic groups", () => {
  const searches = buildGdeltSearches();
  assert.equal(searches.length, 12);
  assert.deepEqual([...new Set(searches.map((s) => s.country))], ["saudi-arabia", "uae", "qatar", "kuwait", "bahrain", "oman"]);
  for (const search of searches) {
    const url = new URL(search.url);
    assert.equal(url.origin, "https://api.gdeltproject.org");
    assert.equal(url.pathname, "/api/v2/doc/doc");
    assert.equal(url.searchParams.get("query"), search.query);
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("mode"), "artlist");
    assert.equal(url.searchParams.get("timespan"), "7d");
    assert.equal(url.searchParams.get("sort"), "datedesc");
    assert(!/sourcecountry:|sourcelang:/i.test(search.query));
    assert(search.query.length <= 250, "Keep the entire query compact, including country aliases");
    assert(search.query.includes("healthtech") || search.query.includes('near8:"healthcare'));
    assert(!/\([^)]*\(/.test(search.query), "GDELT does not support nested OR groups");
  }
  assert(searches.some((s) => s.query.includes('"medical AI"')));
  assert(searches.some((s) => s.query.includes("partnership") && s.query.includes("investment")));
  assert(searches.filter((s) => s.topic === "sector").every((s) => s.query.includes('near8:"healthcare investment"')));
});

test("country and time-window options are bounded and invalid options make no requests", async () => {
  const searches = buildGdeltSearches({ country: "uae", days: 30 });
  assert.equal(searches.length, 2);
  assert(searches.every((s) => s.query.includes('"Abu Dhabi"') && s.url.includes("timespan=30d")));
  for (const invalid of [{ days: 0 }, { days: 91 }, { days: 1.5 }, { days: "7" }, { country: "__proto__" }]) {
    await assert.rejects(collectGdeltNews(options({ ...invalid, fetchImpl: () => assert.fail("Must validate before fetching") })));
  }
});

test("normalizes publisher URLs without changing their host, protocol, content parameters or path case", () => {
  assert.equal(normalizeUrl("http://publisher.example.com/News?id=7&UTM_source=x&gclid=a#top"), "http://publisher.example.com/News?id=7");
  assert.notEqual(normalizeUrl("https://example.com/A?id=1"), normalizeUrl("https://example.com/A?id=2"));
  assert.equal(normalizeUrl(fixture.articles[1].url), mohUrl);
  for (const url of [null, {}, "", "javascript:alert(1)", "ftp://example.com/a", "https://u:p@example.com/a", "http://localhost/a", "http://127.0.0.1/a", "http://[::1]/a", "http://[::ffff:127.0.0.1]/a", "http://intranet.local/a", "https://example.com:8000/a"]) {
    assert.equal(normalizeUrl(url), null, String(url));
  }
});

test("maps only supported metadata and does not invent summaries, dates or story countries", () => {
  const draft = createGdeltDraft({ ...fixture.articles[0], domain: "wrong.example.com", summary: "Ignore untrusted extra field" }, collectedAt);
  assert.equal(draft.original_url, canonicalUrl);
  assert.equal(draft.source_name, "news.example.com");
  assert.equal(draft.status, "draft");
  for (const field of ["summary", "country", "category", "published_at", "source_description"]) assert.equal(draft[field], null);
  assert.equal(draft.collected_at, collectedAt);
  assert.equal(createGdeltDraft({ ...fixture.articles[0], url: canonicalUrl }, collectedAt).slug, draft.slug);
  const arabic = createGdeltDraft({ url: canonicalUrl, title: "الصحة الرقمية" }, collectedAt);
  assert.equal(arabic.title, "الصحة الرقمية");
  assert.match(arabic.slug, /^article-[a-f0-9]{12}$/);
});

test("RSS and GDELT produce identical URL/slug identities for the same MOH article", () => {
  const article = fixture.articles[1];
  const rss = createRssDraft({ title: article.title, link: article.url }, collectedAt);
  const gdelt = createGdeltDraft(article, collectedAt);
  assert.equal(gdelt.original_url, rss.original_url);
  assert.equal(gdelt.slug, rss.slug);
});

test("repeat runs and overlapping queries preserve existing published/RSS rows", async () => {
  const published = { original_url: mohUrl, status: "published", summary: "Reviewed text", slug: "existing-slug", title: "Reviewed headline" };
  const db = database([published]);
  const result = await collectGdeltNews(options({ dryRun: false, supabase: db }));
  assert.equal(result.saved, 1);
  assert.equal(result.found, 4);
  assert.equal(result.duplicates, 3);
  assert.deepEqual(db.rows.get(mohUrl), published);
  assert.equal(db.rows.get(canonicalUrl).status, "draft");
  const before = structuredClone([...db.rows.values()]);
  const repeat = await collectGdeltNews(options({ dryRun: false, supabase: db }));
  assert.equal(repeat.saved, 0);
  assert.equal(repeat.duplicates, 4);
  assert.deepEqual([...db.rows.values()], before);
});

test("dry runs never access Supabase and deduplicate previews across queries", async () => {
  const result = await collectGdeltNews(options({ supabase: { from() { assert.fail("No database access"); } } }));
  assert.equal(result.previewed, 2);
  assert.equal(result.duplicates, 2);
  assert.equal(result.saved, 0);
  assert.equal(result.preview.length, 2);
  assert.equal(result.preview[0].original_url, canonicalUrl);
});

test("invalid individual articles are skipped while valid ones remain collectable", async () => {
  const articles = [null, [], {}, { title: " ", url: canonicalUrl }, { title: "Bad", url: "javascript:bad" }, fixture.articles[0]];
  const result = await collectGdeltNews(options({ fetchImpl: async () => json(articles) }));
  assert.equal(result.invalid, 10);
  assert.equal(result.previewed, 1);
  assert.equal(result.searches.failed, 0);
});

test("valid empty article lists are successful searches", async () => {
  const result = await collectGdeltNews(options({ fetchImpl: async () => json() }));
  assert.equal(result.found, 0);
  assert.equal(result.searches.succeeded, 2);
  assert.equal(result.searches.failed, 0);
  assert.equal(result.requests, 2);
});

test("malformed JSON and unsupported response shapes are failures, not empty results", async () => {
  for (const body of ["", "<html>Unavailable</html>", "No articles found", "null", "{}", '{"articles":{}}', '{"error":"secret response"}']) {
    const result = await collectGdeltNews(options({ fetchImpl: async () => new Response(body) }));
    assert.equal(result.searches.failed, 2);
    assert.equal(result.searches.succeeded, 0);
    assert.equal(result.requests, 2);
    assert(!JSON.stringify(result).includes("secret response"));
  }
});

test("large responses and excess result counts are rejected before saving", async () => {
  for (const fetchImpl of [
    async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
    async () => json(Array.from({ length: 76 }, () => fixture.articles[0])),
  ]) {
    const db = database();
    const result = await collectGdeltNews(options({ dryRun: false, supabase: db, fetchImpl }));
    assert.equal(result.searches.failed, 2);
    assert.equal(db.rows.size, 0);
  }
});

test("plain-text query rejections report an actionable error without becoming empty results", async () => {
  const result = await collectGdeltNews(options({
    fetchImpl: async () => new Response("Your query was too short or too long.\n"),
  }));
  assert.equal(result.searches.failed, 2);
  assert.match(result.issues[0], /rejected the query length or keywords/);
});

test("result caps are visible and duplicate stories at different URLs stay distinct", async () => {
  const articles = Array.from({ length: 75 }, (_, id) => ({ title: "Same headline", url: `https://example.com/news?id=${id}` }));
  const result = await collectGdeltNews(options({ fetchImpl: async () => json(articles) }));
  assert.equal(result.searches.capped, 2);
  assert.equal(result.previewed, 75);
  assert.equal(result.duplicates, 75);
  assert.equal(result.preview.length, 10);
  assert.match(result.issues[0], /shorter --days/);
});

test("requests are sequential, paced, and carry JSON headers and a timeout signal", async () => {
  const events = [];
  let active = false;
  await collectGdeltNews(options({
    sleep: async (ms) => events.push(ms),
    fetchImpl: async (url, init) => {
      assert.equal(active, false);
      active = true;
      assert.equal(init.headers.Accept, "application/json");
      assert.match(init.headers["User-Agent"], /GCC-HealthTech-News/);
      assert(init.signal instanceof AbortSignal);
      assert.equal(init.redirect, "error");
      events.push("fetch");
      await Promise.resolve();
      active = false;
      return json();
    },
  }));
  assert.deepEqual(events, ["fetch", 30_000, "fetch"]);
});

test("temporary rate limits wait at least 60 seconds, retry once, then resume 30-second pacing", async () => {
  for (const headers of [{}, { "Retry-After": "20" }, { "Retry-After": "60" }]) {
    const waits = [];
    let calls = 0;
    const result = await collectGdeltNews(options({
      sleep: async (ms) => waits.push(ms),
      fetchImpl: async () => ++calls === 1 ? new Response("Slow down", { status: 429, headers }) : json(),
    }));
    assert.equal(result.requests, 3);
    assert.equal(result.searches.succeeded, 2);
    assert.deepEqual(waits, [60_000, 30_000]);
  }
});

test("Retry-After HTTP dates are honored", async () => {
  for (const [retryAfter, stops] of [
    ["Thu, 08 Oct 2026 10:01:00 GMT", false],
    ["Thu, 08 Oct 2026 10:02:00 GMT", true],
  ]) {
    const waits = [];
    let calls = 0;
    const result = await collectGdeltNews(options({
      sleep: async (ms) => waits.push(ms),
      fetchImpl: async () => ++calls === 1 ? new Response("Busy", { status: 429, headers: { "Retry-After": retryAfter } }) : json(),
    }));
    assert.equal(result.searches.failed, stops ? 1 : 0);
    assert.equal(result.requests, stops ? 1 : 3);
    assert.deepEqual(waits, stops ? [] : [60_000, 30_000]);
  }
});

test("persistent 429 stops later queries after a bounded retry", async () => {
  const waits = [];
  const result = await collectGdeltNews(options({ country: undefined, sleep: async (ms) => waits.push(ms), fetchImpl: async () => new Response("Limited", { status: 429 }) }));
  assert.equal(result.requests, 2);
  assert.deepEqual(result.searches, { planned: 12, succeeded: 0, failed: 1, skipped: 11, capped: 0 });
  assert.deepEqual(waits, [60_000]);
  assert.match(result.issues[0], /429/);
});

test("a final server-error cooldown also delays the next independent search", async () => {
  const waits = [];
  let calls = 0;
  const result = await collectGdeltNews(options({
    sleep: async (ms) => waits.push(ms),
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return new Response("Busy", { status: 502 });
      if (calls === 2) return new Response("Busy", { status: 503, headers: { "Retry-After": "45" } });
      return json();
    },
  }));
  assert.equal(result.searches.failed, 1);
  assert.equal(result.searches.succeeded, 1);
  assert.deepEqual(waits, [60_000, 45_000]);
});

test("long cooldowns stop without sleeping too long or making an early retry", async () => {
  for (const status of [429, 503]) {
    const result = await collectGdeltNews(options({
      sleep: () => assert.fail("Do not wait beyond the retry budget"),
      fetchImpl: async () => new Response("Busy", { status, headers: { "Retry-After": "120" } }),
    }));
    assert.equal(result.requests, 1);
    assert.equal(result.searches.skipped, 1);
    assert.match(result.issues.join(" "), /cooldown/);
  }
});

test("network failures and server errors get bounded retries without leaking response details", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("SECRET_CONNECTION_DETAIL"); },
    async () => new Response("SECRET_UPSTREAM_DETAIL", { status: 502 }),
  ]) {
    const waits = [];
    const result = await collectGdeltNews(options({ fetchImpl, sleep: async (ms) => waits.push(ms) }));
    assert.equal(result.requests, 4);
    assert.equal(result.searches.failed, 2);
    assert.deepEqual(waits, [60_000, 30_000, 60_000]);
    assert(!JSON.stringify(result).includes("SECRET_"));
  }
});

test("a timeout aborts requests and reports failure", async () => {
  const result = await collectGdeltNews(options({
    requestTimeoutMs: 1,
    fetchImpl: async (url, { signal }) => {
      await delay(10);
      assert.equal(signal.aborted, true);
      throw signal.reason;
    },
  }));
  assert.equal(result.requests, 4);
  assert.equal(result.searches.failed, 2);
  assert.match(result.issues[0], /timed out/);
});

test("non-retryable HTTP errors do not waste retries", async () => {
  const result = await collectGdeltNews(options({ fetchImpl: async () => new Response("Bad query", { status: 400 }) }));
  assert.equal(result.requests, 2);
  assert.equal(result.searches.failed, 2);
});

test("partial results survive a later persistent rate limit and the run remains incomplete", async () => {
  let calls = 0;
  const db = database();
  const result = await collectGdeltNews(options({
    country: undefined, dryRun: false, supabase: db,
    fetchImpl: async () => ++calls === 1 ? json(fixture.articles) : new Response("Limited", { status: 429 }),
  }));
  assert.equal(result.saved, 2);
  assert.equal(result.searches.succeeded, 1);
  assert.equal(result.searches.failed, 1);
  assert.equal(result.searches.skipped, 10);
  assert([...db.rows.values()].every((row) => row.status === "draft"));
});

test("database failure counts remain separate from successful discovery", async () => {
  const db = database([], canonicalUrl);
  const result = await collectGdeltNews(options({ dryRun: false, supabase: db }));
  assert.equal(result.failed, 1);
  assert.equal(result.saved, 1);
  assert.equal(result.searches.succeeded, 2);
  assert(!JSON.stringify(result).includes("SECRET_DETAIL"));
  await assert.rejects(collectGdeltNews({ fetchImpl: () => assert.fail("No fetch without database client") }), /backend Supabase client/);
});

test("CLI rejects invalid flags and supports country/time-window selection", () => {
  assert.deepEqual(parseArgs(["--dry-run", "--country", "oman", "--days", "30"]), { dryRun: true, country: "oman", days: 30 });
  for (const args of [["--country"], ["--country", "unknown"], ["--days"], ["--days", "0"], ["--days", "1.5"], ["--publish"]]) assert.throws(() => parseArgs(args));
});

test("CLI dry run works without reading credentials or creating a database client", async () => {
  const output = [];
  const exit = await run(["--dry-run", "--country", "oman"], {
    loadEnv: () => assert.fail("Dry run must not read env files"),
    createClient: () => assert.fail("Dry run must not create a database client"),
    collect: (args) => collectGdeltNews(options(args)),
    print: (message) => output.push(message),
  });
  assert.equal(exit, 0);
  assert.equal(JSON.parse(output[0]).previewed, 2);
});

test("CLI uses backend credentials for real runs and returns nonzero for incomplete runs", async () => {
  for (const failure of ["database", "search"]) {
    const events = [];
    const exit = await run([], {
      loadEnv: () => events.push("env"),
      createClient: () => { events.push("client"); return "backend"; },
      collect: async ({ supabase }) => {
        assert.equal(supabase, "backend");
        events.push("collect");
        return { failed: failure === "database" ? 1 : 0, searches: { failed: failure === "search" ? 1 : 0, skipped: 0 } };
      },
      print: () => {},
    });
    assert.equal(exit, 1);
    assert.deepEqual(events, ["env", "client", "collect"]);
  }
});

test("CLI help makes no network or credential requests", async () => {
  const exit = await run(["--help"], {
    collect: () => assert.fail("Help must not collect"),
    loadEnv: () => assert.fail("Help must not load credentials"),
    print: (message) => assert.match(message, /--dry-run/),
  });
  assert.equal(exit, 0);
});
