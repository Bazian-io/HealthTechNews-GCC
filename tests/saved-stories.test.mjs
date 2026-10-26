import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SAVED_STORIES,
  parseSavedStories,
  readSavedStories,
  SAVED_STORIES_STORAGE_KEY,
  toggleSavedStory,
  writeSavedStories,
} from "../lib/saved-stories.mjs";

function story(id, overrides = {}) {
  return {
    id,
    slug: `story-${id}`,
    title: `Story ${id}`,
    summary: null,
    source_name: "Example publisher",
    source_description: "Publisher text",
    original_url: `https://example.com/${id}`,
    country: null,
    category: null,
    published_at: null,
    ...overrides,
  };
}

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    value(key) { return values.get(key); },
  };
}

test("adds and removes a saved story without changing the source object", () => {
  const source = story("one");
  const savedAt = "2026-10-22T08:00:00.000Z";
  const added = toggleSavedStory([], source, savedAt);

  assert.equal(added.length, 1);
  assert.equal(added[0].saved_at, savedAt);
  assert.equal(source.saved_at, undefined);
  assert.deepEqual(toggleSavedStory(added, source, savedAt), []);
});

test("parses valid stories, orders newest first, and removes duplicates", () => {
  const parsed = parseSavedStories(JSON.stringify([
    { ...story("same"), title: "Older copy", saved_at: "2026-10-20T08:00:00.000Z" },
    { ...story("new"), saved_at: "2026-10-22T08:00:00.000Z" },
    { ...story("same"), title: "Newer copy", saved_at: "2026-10-21T08:00:00.000Z" },
  ]));

  assert.deepEqual(parsed.map((item) => item.id), ["new", "same"]);
  assert.equal(parsed[1].title, "Newer copy");
});

test("keeps safe image addresses and drops unsafe or missing ones", () => {
  const savedAt = "2026-10-22T08:00:00.000Z";
  const image = "https://cdn.example.com/lead.jpg";
  const [withImage] = toggleSavedStory([], story("image", { image_url: image }), savedAt);
  assert.equal(withImage.image_url, image);

  const parsed = parseSavedStories(JSON.stringify([
    { ...story("older"), saved_at: savedAt },
    { ...story("unsafe"), image_url: "javascript:alert(1)", saved_at: savedAt },
    { ...story("http"), image_url: "http://cdn.example.com/lead.jpg", saved_at: savedAt },
  ]));
  assert.equal(parsed.length, 3);
  for (const item of parsed) assert.equal(item.image_url, null);
});

test("ignores malformed entries and unsafe URLs", () => {
  const valid = { ...story("valid"), saved_at: "2026-10-22T08:00:00.000Z" };
  const parsed = parseSavedStories(JSON.stringify([
    valid,
    { ...valid, id: "", title: "Missing id" },
    { ...valid, id: "javascript", original_url: "javascript:alert(1)" },
    { ...valid, id: "credentials", original_url: "https://user:pass@example.com" },
    { ...valid, id: "date", saved_at: "not-a-date" },
  ]));

  assert.deepEqual(parsed.map((item) => item.id), ["valid"]);
  assert.deepEqual(parseSavedStories("not json"), []);
  assert.deepEqual(parseSavedStories("{}"), []);
});

test("bounds the browser reading list", () => {
  let stories = [];
  for (let index = 0; index < MAX_SAVED_STORIES + 5; index += 1) {
    stories = toggleSavedStory(
      stories,
      story(String(index)),
      new Date(Date.UTC(2026, 9, 22, 8, 0, index)).toISOString(),
    );
  }

  assert.equal(stories.length, MAX_SAVED_STORIES);
  assert.equal(stories[0].id, String(MAX_SAVED_STORIES + 4));
});

test("reads and writes storage while tolerating unavailable browser storage", () => {
  const storage = memoryStorage();
  const stories = toggleSavedStory([], story("stored"), "2026-10-22T08:00:00.000Z");

  assert.equal(writeSavedStories(storage, stories), true);
  assert.deepEqual(readSavedStories(storage), stories);
  assert.match(storage.value(SAVED_STORIES_STORAGE_KEY), /Story stored/);

  const unavailable = {
    getItem() { throw new Error("unavailable"); },
    setItem() { throw new Error("unavailable"); },
  };
  assert.deepEqual(readSavedStories(unavailable), []);
  assert.equal(writeSavedStories(unavailable, stories), false);
});
