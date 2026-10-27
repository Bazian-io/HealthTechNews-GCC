import { getArticleTopicId, TREND_THEMES } from "./trending-news.mjs";

// Bubble view of the same rule-based themes used by "Trending this week".
// Size and horizontal position show coverage; height shows the change against
// the equally long period before it. Counts describe this briefing only.

const DAY_MS = 24 * 60 * 60 * 1_000;

export const LANDSCAPE_PERIODS = [
  { id: "week", label: "This week", days: 7, comparison: "the previous week" },
  { id: "month", label: "Last 4 weeks", days: 28, comparison: "the 4 weeks before" },
  { id: "two-months", label: "Last 8 weeks", days: 56, comparison: "the 8 weeks before" },
];

// Fewer stories than this are shown faded and labelled as limited data.
export const MIN_RELIABLE_STORIES = 2;
// The map is only drawn when at least this many themes have current coverage.
export const MIN_MAPPED_THEMES = 3;
const MOMENTUM_THRESHOLD = 0.2;

const SHORT_LABELS = {
  "clinical-ai": "Clinical AI",
  "virtual-care": "Virtual care",
  "digital-platforms": "Digital platforms",
  "health-data": "Health data",
  funding: "Funding",
  partnerships: "Partnerships",
  devices: "Devices",
};

function timestamp(article) {
  const value = Date.parse(article?.created_at);
  return Number.isFinite(value) ? value : null;
}

function publisherKey(article) {
  return typeof article.source_name === "string"
    ? article.source_name.trim().toLocaleLowerCase().replace(/^www\./, "")
    : "";
}

function summarizePeriod(articlesByTheme, period, now, earliest) {
  const currentStart = now - period.days * DAY_MS;
  const previousStart = currentStart - period.days * DAY_MS;
  // Without stories from before the previous period began, a comparison would
  // make every theme look like it is gaining. Say so instead.
  const hasComparison = earliest !== null && earliest <= previousStart;

  const themes = TREND_THEMES.map((theme) => {
    const stories = articlesByTheme.get(theme.id) ?? [];
    const current = stories.filter(({ time }) => time > currentStart && time <= now);
    const previous = stories.filter(({ time }) => time > previousStart && time <= currentStart);
    const change = current.length - previous.length;
    const momentum = hasComparison && (current.length || previous.length)
      ? change / Math.max(current.length, previous.length)
      : 0;
    const publishers = new Set(current.map(({ article }) => publisherKey(article)).filter(Boolean));

    return {
      id: theme.id,
      label: theme.label,
      short_label: SHORT_LABELS[theme.id] ?? theme.label,
      story_count: current.length,
      previous_count: previous.length,
      change,
      momentum,
      status: !hasComparison
        ? "Not compared"
        : momentum > MOMENTUM_THRESHOLD
          ? "Gaining"
          : momentum < -MOMENTUM_THRESHOLD
            ? "Fading"
            : "Steady",
      publisher_count: publishers.size,
      limited: current.length < MIN_RELIABLE_STORIES,
      headlines: current
        .slice(0, 2)
        .map(({ article }) => ({
          id: article.id,
          title: article.title,
          slug: typeof article.slug === "string" && article.slug.trim() ? article.slug.trim() : null,
          source_name: article.source_name ?? null,
        })),
    };
  })
    // A theme absent from both periods has nothing to show.
    .filter((theme) => theme.story_count > 0 || theme.previous_count > 0);

  return {
    id: period.id,
    label: period.label,
    comparison: period.comparison,
    has_comparison: hasComparison,
    mapped: themes.filter((theme) => theme.story_count > 0).length >= MIN_MAPPED_THEMES,
    themes,
  };
}

export function analyzeThemeLandscape(articles, nowValue = Date.now()) {
  const now = typeof nowValue === "number" ? nowValue : Date.parse(nowValue);
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const articlesByTheme = new Map();
  let earliest = null;

  for (const article of Array.isArray(articles) ? articles : []) {
    const time = timestamp(article);
    if (time === null || time > safeNow || typeof article.title !== "string") continue;
    earliest = earliest === null ? time : Math.min(earliest, time);
    const theme = getArticleTopicId(article);
    if (!theme) continue;
    const list = articlesByTheme.get(theme) ?? [];
    list.push({ article, time });
    articlesByTheme.set(theme, list);
  }
  // Newest first, so headline examples are the latest stories.
  for (const list of articlesByTheme.values()) list.sort((a, b) => b.time - a.time);

  return {
    generated_at: new Date(safeNow).toISOString(),
    periods: LANDSCAPE_PERIODS.map((period) =>
      summarizePeriod(articlesByTheme, period, safeNow, earliest),
    ),
  };
}

// Places bubbles in a width x height drawing area: x by story count, y by
// momentum, radius by story count. A label goes inside a bubble when it fits,
// otherwise centred below it; each node reserves room for its label, and
// overlaps are then gently pushed apart.
export function layoutBubbles(themes, {
  width = 800, height = 420, padding = 64, minRadius = 16, maxRadius = 58, font = 13,
  // Space kept free for chart labels above, below, and right of the bubbles.
  topMargin = 4, bottomMargin = 4, rightMargin = 4,
} = {}) {
  const maxCount = Math.max(1, ...themes.map((theme) => theme.story_count));
  const middle = height / 2;
  const nodes = themes.map((theme) => {
    const share = theme.story_count / maxCount;
    const radius = minRadius + (maxRadius - minRadius) * Math.sqrt(share);
    // Approximate width of semibold label text.
    const labelWidth = (theme.short_label?.length ?? 0) * font * 0.66;
    const inside = labelWidth + 14 <= radius * 2;
    const halfWidth = inside ? radius : Math.max(radius, labelWidth / 2 + 4);
    const below = inside ? radius : radius + font + 6;
    return {
      id: theme.id,
      radius,
      inside,
      // The node's box: halfWidth left and right, radius above, below under
      // the centre, so a label beneath a small bubble is part of its space.
      halfWidth,
      below,
      x: padding + share * (width - rightMargin - padding * 2),
      y: middle - theme.momentum * (middle - padding),
    };
  });

  const clamp = (node) => {
    node.x = Math.min(width - node.halfWidth - rightMargin, Math.max(node.halfWidth + 4, node.x));
    node.y = Math.min(height - node.below - bottomMargin, Math.max(node.radius + topMargin, node.y));
  };

  const gap = 6;
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        // How far the two boxes (plus a small gap) overlap on each axis.
        const overlapX = a.halfWidth + b.halfWidth + gap - Math.abs(b.x - a.x);
        const overlapY =
          Math.min(a.y + a.below, b.y + b.below)
          - Math.max(a.y - a.radius, b.y - b.radius)
          + gap;
        if (overlapX <= 0 || overlapY <= 0) continue;
        // Separate along the shorter overlap. Bubbles sharing a height slide
        // sideways, so their momentum position stays where it belongs.
        if (overlapX <= overlapY) {
          const direction = b.x > a.x || (b.x === a.x && j > i) ? 1 : -1;
          a.x -= (direction * overlapX) / 2;
          b.x += (direction * overlapX) / 2;
        } else {
          const centreA = a.y + (a.below - a.radius) / 2;
          const centreB = b.y + (b.below - b.radius) / 2;
          const direction = centreB >= centreA ? 1 : -1;
          a.y -= (direction * overlapY) / 2;
          b.y += (direction * overlapY) / 2;
        }
        moved = true;
      }
    }
    nodes.forEach(clamp);
    if (!moved) break;
  }

  return new Map(nodes.map((node) => [node.id, node]));
}
