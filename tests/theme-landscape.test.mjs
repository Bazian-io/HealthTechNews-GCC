import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeThemeLandscape,
  layoutBubbles,
  MIN_MAPPED_THEMES,
} from "../lib/theme-landscape.mjs";

const NOW = Date.parse("2026-10-27T12:00:00.000Z");
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1_000).toISOString();
let next = 0;
const story = (title, publisher, age) => ({
  id: `s${++next}`, slug: `story-${next}`, title, source_name: publisher,
  summary: null, source_description: null, created_at: daysAgo(age),
});

const ai = (publisher, age) => story("Hospital adopts artificial intelligence for diagnosis", publisher, age);
const care = (publisher, age) => story("Clinic launches telemedicine service", publisher, age);
const money = (publisher, age) => story("Startup raises Series A funding", publisher, age);
const device = (publisher, age) => story("New wearable medical device approved", publisher, age);

// Old enough that every period has an earlier period to compare against.
const history = story("Archive note without a theme", "Archive", 120);

const period = (result, id) => result.periods.find((candidate) => candidate.id === id);
const theme = (summary, id) => summary.themes.find((candidate) => candidate.id === id);

test("counts stories per theme and compares with the previous equal period", () => {
  const result = analyzeThemeLandscape([
    history,
    ai("A", 1), ai("B", 2), ai("www.b", 3), ai("C", 9),
    care("A", 1), care("B", 10), care("C", 11), care("D", 12),
    money("A", 2), money("B", 8),
  ], NOW);
  const week = period(result, "week");
  assert.equal(week.has_comparison, true);
  assert.equal(week.mapped, true);

  const clinical = theme(week, "clinical-ai");
  assert.deepEqual(
    [clinical.story_count, clinical.previous_count, clinical.change, clinical.status, clinical.publisher_count],
    [3, 1, 2, "Gaining", 2],
  );
  assert.equal(clinical.headlines.length, 2);
  assert.equal(clinical.headlines[0].slug, "story-2");

  const virtual = theme(week, "virtual-care");
  assert.deepEqual([virtual.story_count, virtual.previous_count, virtual.status, virtual.limited], [1, 3, "Fading", true]);
  assert.equal(theme(week, "funding").status, "Steady");
  assert.equal(theme(week, "devices"), undefined, "themes absent from both periods are left out");
});

test("does not claim momentum when there is no earlier data to compare", () => {
  const result = analyzeThemeLandscape([ai("A", 1), care("B", 2), money("C", 3), device("D", 4)], NOW);
  for (const summary of result.periods) {
    assert.equal(summary.has_comparison, false);
    for (const item of summary.themes) {
      assert.equal(item.momentum, 0);
      assert.equal(item.status, "Not compared");
    }
  }
});

test("asks for more coverage instead of drawing a near-empty map", () => {
  const result = analyzeThemeLandscape([history, ai("A", 1), care("B", 2)], NOW);
  assert.equal(period(result, "week").mapped, false);
  assert(MIN_MAPPED_THEMES > 2);
  assert.equal(analyzeThemeLandscape([], NOW).periods.every((summary) => !summary.mapped), true);
});

test("ignores future, undated, and invalid rows", () => {
  const result = analyzeThemeLandscape([
    history, null, { title: "Hospital adopts artificial intelligence" },
    ai("A", -1), { ...ai("A", 1), created_at: "not a date" }, ai("B", 1),
  ], NOW);
  assert.equal(theme(period(result, "week"), "clinical-ai").story_count, 1);
});

test("lays out bubbles inside the drawing area without overlaps", () => {
  const themes = ["a", "b", "c", "d", "e", "f", "g"].map((id, index) => ({
    id, story_count: index % 2 ? 9 : 2, momentum: 0,
  }));
  const width = 800;
  const height = 420;
  const layout = layoutBubbles(themes, { width, height });
  const nodes = [...layout.values()];
  assert.equal(nodes.length, themes.length);
  for (const node of nodes) {
    assert(node.x - node.radius >= 0 && node.x + node.radius <= width, `${node.id} x`);
    assert(node.y - node.radius >= 0 && node.y + node.radius <= height, `${node.id} y`);
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const distance = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      assert(distance >= nodes[i].radius + nodes[j].radius, `${nodes[i].id} overlaps ${nodes[j].id}`);
    }
  }
  assert(layout.get("b").radius > layout.get("a").radius, "more stories means a bigger bubble");
});

test("labels fit inside big bubbles and sit clear of neighbours under small ones", () => {
  const font = 13;
  const themes = [
    { id: "big", short_label: "Clinical AI", story_count: 24, momentum: 0 },
    { id: "a", short_label: "Digital platforms", story_count: 2, momentum: 0.4 },
    { id: "b", short_label: "Funding", story_count: 2, momentum: 0.4 },
    { id: "c", short_label: "Virtual care", story_count: 1, momentum: 0.4 },
  ];
  const width = 800;
  const height = 400;
  const layout = layoutBubbles(themes, { width, height, font });
  assert.equal(layout.get("big").inside, true);
  assert.equal(layout.get("a").inside, false);

  // Each node's box covers its bubble and, when outside, its label below.
  const box = (node) => ({
    left: node.x - node.halfWidth, right: node.x + node.halfWidth,
    top: node.y - node.radius, bottom: node.y + node.below,
  });
  const boxes = [...layout.values()].map((node) => [node.id, box(node)]);
  for (const [id, b] of boxes) {
    assert(b.left >= 0 && b.right <= width && b.top >= 0 && b.bottom <= height, `${id} stays in bounds`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [idA, a] = boxes[i];
      const [idB, b] = boxes[j];
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      assert(!overlap, `${idA} and ${idB} overlap`);
    }
  }
});

test("bubbles sharing the steady line stay on it and keep clear of the right margin", () => {
  const themes = ["Clinical AI", "Digital platforms", "Funding", "Virtual care"].map((label, index) => ({
    id: `t${index}`, short_label: label, story_count: [24, 11, 2, 1][index], momentum: 0,
  }));
  const layout = layoutBubbles(themes, { width: 800, height: 430, rightMargin: 90 });
  for (const node of layout.values()) {
    assert.equal(node.y, 215, `${node.id} stays on the steady line`);
    assert(node.x + node.halfWidth <= 800 - 90, `${node.id} stays clear of the right margin`);
  }
});

test("rising themes sit higher than fading ones", () => {
  const layout = layoutBubbles([
    { id: "up", story_count: 4, momentum: 1 },
    { id: "down", story_count: 4, momentum: -1 },
  ]);
  assert(layout.get("up").y < layout.get("down").y);
});
