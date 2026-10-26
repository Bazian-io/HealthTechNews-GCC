import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTrendingNews,
  TREND_WINDOW_HOURS,
} from "../lib/trending-news.mjs";

const NOW = Date.parse("2026-10-25T12:00:00.000Z");

function hoursAgo(hours) {
  return new Date(NOW - hours * 60 * 60 * 1_000).toISOString();
}

function article(id, title, sourceName, ageHours, overrides = {}) {
  return {
    id,
    slug: `story-${id}`,
    title,
    summary: null,
    source_description: null,
    source_name: sourceName,
    created_at: hoursAgo(ageHours),
    ...overrides,
  };
}

test("identifies a multi-publisher topic within the last 72 hours", () => {
  const result = analyzeTrendingNews([
    article("one", "Hospital launches AI-powered clinical platform", "Publisher A", 4),
    article("two", "Medical AI supports new hospital workflows", "Publisher B", 8),
    article("old", "Artificial intelligence in healthcare", "Publisher C", 80),
  ], NOW);

  assert.equal(result.recent_article_count, 2);
  assert.equal(result.trends.length, 1);
  assert.equal(result.trends[0].id, "clinical-ai");
  assert.equal(result.trends[0].state, "Emerging");
  assert.equal(result.trends[0].publisher_count, 2);
  assert.deepEqual(result.trends[0].evidence.map((item) => item.id), ["one", "two"]);
});

test("does not label one publisher or unrelated stories as a trend", () => {
  const result = analyzeTrendingNews([
    article("one", "Hospital launches AI-powered platform", "Publisher A", 3),
    article("two", "Medical AI supports clinical workflows", "Publisher A", 7),
    article("three", "Startup secures new funding", "Publisher B", 10),
  ], NOW);

  assert.equal(result.trends.length, 0);
  assert.deepEqual(result.latest_articles.map((item) => item.id), ["one", "two", "three"]);
});

test("ranks publisher breadth before raw article count", () => {
  const result = analyzeTrendingNews([
    article("ai-one", "Clinical AI system announced", "Publisher A", 5),
    article("ai-two", "Hospital adopts medical AI", "Publisher B", 18),
    article("ai-three", "AI-powered care platform expands", "Publisher C", 30),
    article("fund-one", "Care startup secures new funding round", "Publisher D", 2),
    article("fund-two", "Healthcare company attracts investment", "Publisher E", 4),
    article("fund-three", "New healthcare funding announced", "Publisher D", 8),
    article("fund-four", "Healthcare funding closes", "Publisher E", 12),
  ], NOW);

  assert.equal(result.trends[0].id, "clinical-ai");
  assert.equal(result.trends[0].publisher_count, 3);
  assert.equal(result.trends[1].id, "funding");
  assert.equal(result.trends[1].story_count, 4);
});

test("marks rising coverage as accelerating and places it into six chart buckets", () => {
  const result = analyzeTrendingNews([
    article("old", "Medical AI enters clinical testing", "Publisher A", 55),
    article("new-one", "AI-powered hospital tool launches", "Publisher B", 8),
    article("new-two", "Clinical AI platform expands", "Publisher C", 2),
  ], NOW);
  const trend = result.trends[0];

  assert.equal(trend.state, "Accelerating");
  assert.equal(trend.latest_24h_count, 2);
  assert.equal(trend.chart_counts.length, TREND_WINDOW_HOURS / 12);
  assert.equal(trend.chart_counts.reduce((sum, count) => sum + count, 0), 3);
});

test("uses title matches ahead of weaker excerpt matches so evidence is not duplicated", () => {
  const result = analyzeTrendingNews([
    article("one", "Telemedicine service expands", "Publisher A", 3, {
      source_description: "The company also uses artificial intelligence.",
    }),
    article("two", "Remote patient monitoring reaches new hospitals", "Publisher B", 9),
    article("three", "Clinical AI platform launches", "Publisher C", 12),
  ], NOW);

  assert.equal(result.trends.length, 1);
  assert.equal(result.trends[0].id, "virtual-care");
  assert.deepEqual(result.trends[0].evidence.map((item) => item.id), ["one", "two"]);
});

test("ignores invalid and future timestamps without failing", () => {
  const result = analyzeTrendingNews([
    article("invalid", "Medical AI platform", "Publisher A", 2, { created_at: "invalid" }),
    article("future", "Clinical AI system", "Publisher B", -2),
    null,
  ], NOW);

  assert.equal(result.recent_article_count, 0);
  assert.deepEqual(result.trends, []);
  assert.deepEqual(result.latest_articles, []);
});
