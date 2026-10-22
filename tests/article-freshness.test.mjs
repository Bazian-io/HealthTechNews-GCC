import assert from "node:assert/strict";
import test from "node:test";
import {
  countNewSinceVisit,
  getArticleDayGroup,
  isNewSinceVisit,
  LAST_VISIT_STORAGE_KEY,
  startBriefingVisit,
} from "../lib/article-freshness.mjs";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    value(key) { return values.get(key); },
  };
}

test("groups stories by their briefing day in GCC time", () => {
  const now = "2026-10-22T04:00:00.000Z"; // 07:00 on 22 October in Riyadh
  assert.equal(getArticleDayGroup("2026-10-21T22:30:00.000Z", now), "today");
  assert.equal(getArticleDayGroup("2026-10-21T12:00:00.000Z", now), "yesterday");
  assert.equal(getArticleDayGroup("2026-10-20T12:00:00.000Z", now), "earlier");
  assert.equal(getArticleDayGroup("invalid", now), "earlier");
});

test("marks only stories added after the previous visit and before this visit", () => {
  const previous = Date.parse("2026-10-21T08:00:00.000Z");
  const started = Date.parse("2026-10-22T08:00:00.000Z");
  const timestamps = [
    "2026-10-21T07:59:59.000Z",
    "2026-10-21T08:00:00.000Z",
    "2026-10-21T09:00:00.000Z",
    "2026-10-22T08:00:00.000Z",
    "2026-10-22T08:00:01.000Z",
    "invalid",
  ];

  assert.equal(isNewSinceVisit(timestamps[2], previous, started), true);
  assert.equal(isNewSinceVisit(timestamps[0], previous, started), false);
  assert.equal(countNewSinceVisit(timestamps, previous, started), 2);
  assert.equal(countNewSinceVisit(timestamps, null, started), 0);
});

test("starts a visit from valid browser history and records the current visit", () => {
  const previous = "2026-10-21T08:00:00.000Z";
  const started = Date.parse("2026-10-22T08:00:00.000Z");
  const storage = memoryStorage({ [LAST_VISIT_STORAGE_KEY]: previous });

  assert.deepEqual(startBriefingVisit(storage, started), {
    previousVisitAt: Date.parse(previous),
    visitStartedAt: started,
  });
  assert.equal(storage.value(LAST_VISIT_STORAGE_KEY), "2026-10-22T08:00:00.000Z");
});

test("ignores invalid or future visit history and tolerates unavailable storage", () => {
  const started = Date.parse("2026-10-22T08:00:00.000Z");
  for (const stored of ["invalid", "2026-10-23T08:00:00.000Z"]) {
    const storage = memoryStorage({ [LAST_VISIT_STORAGE_KEY]: stored });
    assert.equal(startBriefingVisit(storage, started).previousVisitAt, null);
  }

  const unavailable = {
    getItem() { throw new Error("unavailable"); },
    setItem() { throw new Error("unavailable"); },
  };
  assert.deepEqual(startBriefingVisit(unavailable, started), {
    previousVisitAt: null,
    visitStartedAt: started,
  });
});
