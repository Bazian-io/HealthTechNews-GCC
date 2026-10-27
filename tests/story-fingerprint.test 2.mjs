import assert from "node:assert/strict";
import test from "node:test";
import { groupSameStories, storyFingerprint } from "../lib/story-fingerprint.mjs";

const clinics = "Clinics On Cloud Raises Rs 120 Crore in Series A Funding from Dubai-Based Investors";

test("the same headline matches regardless of case, punctuation, and accents", () => {
  const key = storyFingerprint(clinics, "www.business-standard.com");
  assert.equal(key, "clinics on cloud raises rs 120 crore in series a funding from dubai based investors");
  assert.equal(storyFingerprint(`  ${clinics.toUpperCase()}!  `, "example.com"), key);
  assert.equal(storyFingerprint("Café opens AI clinic in Doha", null), storyFingerprint("Cafe opens AI clinic in Doha", null));
  assert.equal(storyFingerprint("M&A boosts UAE health tech", null), "m and a boosts uae health tech");
});

test("a trailing publisher name is removed only when it matches the publisher", () => {
  const key = storyFingerprint(clinics, "www.business-standard.com");
  assert.equal(storyFingerprint(`${clinics} - The Tribune`, "www.tribuneindia.com"), key);
  assert.equal(storyFingerprint(`${clinics} | The National`, "www.thenationalnews.com"), key);
  assert.equal(storyFingerprint(`${clinics} — Gulf News`, "gulfnews.com"), key);
  // A different ending is real headline wording and stays.
  assert.notEqual(storyFingerprint("UAE launches AI hospital - second phase begins", "www.wam.ae"), storyFingerprint("UAE launches AI hospital", "www.wam.ae"));
  assert.notEqual(storyFingerprint(`${clinics} - The Tribune`, "www.business-standard.com"), key);
  // Hyphenated words and colons are not separators.
  assert.match(storyFingerprint("Startup Wrap: MENA attracts fresh funding", "www.arabnews.com"), /^startup wrap mena/);
});

test("short or missing headlines are never treated as the same story", () => {
  for (const title of [undefined, null, 42, "", "Health news", "AI in Doha"]) {
    assert.equal(storyFingerprint(title, "example.com"), null);
  }
});

test("groups copies of one story and keeps distinct stories separate", () => {
  const image = "https://cdn.example.com/a.jpg";
  // Newest first, as the website loads them.
  const articles = [
    { id: "tribune", title: `${clinics} - The Tribune`, source_name: "www.tribuneindia.com", image_url: image },
    { id: "other", title: "Qatar adopts connected vital signs monitoring", source_name: "menafn.com", image_url: null },
    { id: "bs-amp", title: clinics, source_name: "www.business-standard.com", image_url: image },
    { id: "bs", title: clinics, source_name: "www.business-standard.com", image_url: image },
    { id: "short-1", title: "Health news", source_name: "a.com", image_url: null },
    { id: "short-2", title: "Health news", source_name: "b.com", image_url: null },
  ];
  const grouped = groupSameStories(articles);
  assert.deepEqual(grouped.map((article) => article.id), ["other", "bs", "short-1", "short-2"]);
  assert.deepEqual(grouped[1].also_covered_by, ["www.tribuneindia.com"]);
  assert.deepEqual(grouped[0].also_covered_by, []);
  assert.equal(articles[3].also_covered_by, undefined, "input rows are not changed");
});

test("lists each other publisher once, treating www and bare domains as one", () => {
  const grouped = groupSameStories([
    { id: "3", title: clinics, source_name: "bolnews.com", image_url: null },
    { id: "2", title: clinics, source_name: "www.arabnews.com", image_url: null },
    { id: "1", title: clinics, source_name: "www.bolnews.com", image_url: null },
    { id: "0", title: clinics, source_name: "arabnews.com", image_url: null },
  ]);
  assert.deepEqual(grouped.map((article) => [article.id, article.also_covered_by]), [["0", ["bolnews.com"]]]);
});

test("prefers a regular page over an AMP copy of the same story", () => {
  const image = "https://cdn.example.com/a.jpg";
  const grouped = groupSameStories([
    { id: "regular", title: clinics, source_name: "a.com", image_url: image, original_url: "https://a.com/content/story.html" },
    { id: "amp", title: clinics, source_name: "a.com", image_url: image, original_url: "https://a.com/amp/content/story.html" },
  ]);
  assert.deepEqual(grouped.map((article) => [article.id, article.also_covered_by]), [["regular", []]]);
});

test("prefers the earliest copy that has an image", () => {
  const grouped = groupSameStories([
    { id: "new-with-image", title: clinics, source_name: "b.com", image_url: "https://b.com/a.jpg" },
    { id: "old-no-image", title: clinics, source_name: "a.com", image_url: null },
  ]);
  assert.deepEqual(grouped.map((article) => [article.id, article.also_covered_by]), [["new-with-image", ["a.com"]]]);
});
