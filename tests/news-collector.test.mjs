import assert from "node:assert/strict";
import test from "node:test";
import { collectNews, createCollectorClient, createDraft, normalizeArticleUrl } from "../lib/news-collector.mjs";

const url = "https://www.moh.gov.sa/en/Ministry/MediaCenter/News/Pages/example.aspx";
const collectedAt = "2026-09-16T12:00:00.000Z";
const escapeXml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function feed(items) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Example source</title>${items.map((item) => `
    <item><title>${escapeXml(item.title ?? "Example headline")}</title>
    <link>${escapeXml(item.link ?? url)}</link>
    <description><![CDATA[<p>Short source description &amp; details.</p>]]></description>
    <pubDate>Wed, 16 Sep 2026 10:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;
}

function database(existing = [], failUrl) {
  const rows = new Map(existing.map((row) => [row.original_url, row]));
  return {
    rows,
    from(table) {
      assert.equal(table, "articles");
      return {
        upsert(row, options) {
          assert.deepEqual(options, { onConflict: "original_url", ignoreDuplicates: true });
          return {
            async select(columns) {
              assert.equal(columns, "id");
              if (row.original_url === failUrl) return { data: null, error: { code: "42501", message: "PRIVATE_DATABASE_DETAIL" } };
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

function options(supabase, xml = feed([{}])) {
  return { supabase, fetchImpl: async () => new Response(xml), now: () => new Date(collectedAt) };
}

test("normalizes this source's URLs without removing content parameters", () => {
  assert.equal(normalizeArticleUrl("http://moh.gov.sa/News.aspx?id=7&utm_source=email&fbclid=x#section"), "https://www.moh.gov.sa/News.aspx?id=7");
  assert.notEqual(normalizeArticleUrl(url + "?id=1"), normalizeArticleUrl(url + "?id=2"));
});

test("rejects malformed, unsafe, and unrelated source URLs", () => {
  for (const bad of [undefined, "", "not a URL", "javascript:alert(1)", "https://example.com/a", "https://user:password@www.moh.gov.sa/a", "https://www.moh.gov.sa:8080/a"]) {
    assert.equal(normalizeArticleUrl(bad), null);
  }
});

test("creates stable unique slugs for different URLs with the same headline", () => {
  const first = createDraft({ title: "A New Service!", link: url }, collectedAt);
  const same = createDraft({ title: "A New Service!", link: url + "?utm_source=email" }, collectedAt);
  const different = createDraft({ title: "A New Service!", link: url + "?id=2" }, collectedAt);
  assert.equal(first.slug, same.slug);
  assert.notEqual(first.slug, different.slug);
  assert.match(first.slug, /^a-new-service-[a-f0-9]{12}$/);
  assert.match(createDraft({ title: "صحة", link: url }, collectedAt).slug, /^article-[a-f0-9]{12}$/);
});

test("saves publisher text separately and leaves classification and summary unset", async () => {
  const db = database();
  const result = await collectNews(options(db));
  assert.equal(result.saved, 1);
  const row = db.rows.get(url);
  assert.equal(row.status, "draft");
  assert.equal(row.summary, null);
  assert.equal(row.country, null);
  assert.equal(row.category, null);
  assert.equal(row.source_name, "Saudi Ministry of Health");
  assert.equal(row.source_description, "Short source description & details.");
  assert.equal(row.published_at, "2026-09-16T10:00:00.000Z");
  assert.equal(row.collected_at, collectedAt);
});

test("repeat runs skip stored articles and do not overwrite published content", async () => {
  const published = { original_url: url, status: "published", title: "Edited headline", summary: "Reviewed summary", slug: "existing-slug" };
  const db = database([published]);
  const xml = feed([{}, { link: url + "?id=2" }]);
  const first = await collectNews(options(db, xml));
  const before = structuredClone([...db.rows.values()]);
  const second = await collectNews(options(db, xml));
  assert.equal(first.saved, 1);
  assert.equal(first.duplicates, 1);
  assert.equal(second.saved, 0);
  assert.equal(second.duplicates, 2);
  assert.deepEqual([...db.rows.values()], before);
  assert.deepEqual(db.rows.get(url), published);
});

test("skips duplicate feed entries after URL normalization", async () => {
  const db = database();
  const result = await collectNews(options(db, feed([{}, { link: url + "?utm_source=email#top" }])));
  assert.equal(result.found, 2);
  assert.equal(result.saved, 1);
  assert.equal(result.duplicates, 1);
});

test("skips invalid items and continues collecting valid items", async () => {
  const db = database();
  const result = await collectNews(options(db, feed([{ title: " " }, { link: "javascript:bad" }, {}])));
  assert.equal(result.invalid, 2);
  assert.equal(result.saved, 1);
  assert.equal(result.issues.length, 2);
});

test("unusable publication dates are left empty", () => {
  const row = createDraft({ title: "Example", link: url, pubDate: "invalid" }, collectedAt);
  assert.equal(row.published_at, null);
});

test("missing or whitespace-only publisher descriptions stay empty", () => {
  for (const contentSnippet of [undefined, "", " \n\t "]) {
    const row = createDraft({ title: "Example", link: url, contentSnippet }, collectedAt);
    assert.equal(row.source_description, null);
    assert.equal(row.summary, null);
  }
});

test("dry runs preview articles without touching the database", async () => {
  const forbiddenDb = { from() { throw new Error("Database should not be accessed"); } };
  const result = await collectNews({ ...options(forbiddenDb), dryRun: true });
  assert.equal(result.previewed, 1);
  assert.equal(result.saved, 0);
  assert.equal(result.preview[0].original_url, url);
});

test("database failures are counted, sanitized, and do not stop later items", async () => {
  const db = database([], url);
  const result = await collectNews(options(db, feed([{}, { link: url + "?id=2" }])));
  assert.equal(result.failed, 1);
  assert.equal(result.saved, 1);
  assert.match(result.issues[0], /42501/);
  assert(!JSON.stringify(result).includes("PRIVATE_DATABASE_DETAIL"));
});

test("thrown database connection errors are counted without leaking details", async () => {
  const db = { from() { throw new Error("PRIVATE_CONNECTION_DETAIL"); } };
  const result = await collectNews(options(db));
  assert.equal(result.failed, 1);
  assert(!JSON.stringify(result).includes("PRIVATE_CONNECTION_DETAIL"));
});

test("unreachable, HTTP-error, malformed, and oversized feeds fail before any writes", async () => {
  const db = database();
  for (const fetchImpl of [
    async () => { throw new Error("Network error"); },
    async () => new Response("Unavailable", { status: 503 }),
    async () => new Response("<html>Not RSS</html>"),
    async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
  ]) {
    await assert.rejects(collectNews({ ...options(db), fetchImpl }));
  }
  assert.equal(db.rows.size, 0);
});

test("an empty feed is reported clearly without writes", async () => {
  const db = database();
  const result = await collectNews(options(db, feed([])));
  assert.equal(result.found, 0);
  assert.equal(result.saved, 0);
  assert.equal(result.failed, 0);
});

test("missing or public-only credentials produce a clear configuration error", () => {
  assert.throws(() => createCollectorClient({}), /SUPABASE_SECRET_KEY/);
  assert.throws(() => createCollectorClient({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_publishable_example" }), /backend secret key/);
});
