export const TREND_WINDOW_HOURS = 72;
export const TREND_BUCKET_HOURS = 12;
export const MIN_TREND_STORIES = 2;
export const MIN_TREND_PUBLISHERS = 2;

const HOUR_MS = 60 * 60 * 1_000;
const MAX_TRENDS = 3;
const MAX_EVIDENCE_ARTICLES = 6;

const TOPICS = [
  {
    id: "clinical-ai",
    label: "Clinical AI and automation",
    subject: "clinical AI and automation",
    keywords: [
      "artificial intelligence",
      "medical ai",
      "clinical ai",
      "healthcare ai",
      "health ai",
      "ai powered",
      "machine learning",
      "generative ai",
      "predictive analytics",
      "robotic",
      "automation",
      "ai",
    ],
  },
  {
    id: "virtual-care",
    label: "Virtual care and remote monitoring",
    subject: "virtual care and remote monitoring",
    keywords: [
      "telemedicine",
      "telehealth",
      "virtual care",
      "virtual health",
      "remote patient",
      "remote monitoring",
      "digital clinic",
      "online consultation",
      "connected care",
    ],
  },
  {
    id: "digital-platforms",
    label: "Digital health platforms",
    subject: "digital health platforms and services",
    keywords: [
      "digital health",
      "digital healthcare",
      "healthtech",
      "health tech",
      "health platform",
      "healthcare platform",
      "health app",
      "mobile health",
    ],
  },
  {
    id: "health-data",
    label: "Health data and interoperability",
    subject: "health data and interoperability",
    keywords: [
      "electronic health record",
      "electronic medical record",
      "health data",
      "interoperability",
      "data platform",
      "ehr",
      "emr",
    ],
  },
  {
    id: "funding",
    label: "Funding and consolidation",
    subject: "funding, investment, and consolidation",
    keywords: [
      "funding",
      "fundraise",
      "fundraising",
      "investment",
      "venture capital",
      "series a",
      "series b",
      "acquisition",
      "acquires",
      "merger",
    ],
  },
  {
    id: "partnerships",
    label: "Partnerships and expansion",
    subject: "partnerships and regional expansion",
    keywords: [
      "partnership",
      "partners with",
      "collaboration",
      "collaborates",
      "memorandum",
      "mou",
      "expansion",
      "expands",
    ],
  },
  {
    id: "devices",
    label: "Medical devices and diagnostics",
    subject: "medical devices and diagnostics",
    keywords: [
      "medical device",
      "wearable",
      "diagnostic",
      "diagnostics",
      "medical imaging",
      "health sensor",
    ],
  },
];

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return ` ${value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

function phraseAppears(text, phrase) {
  return text.includes(` ${phrase} `);
}

function getTopicScore(article, topic) {
  const title = normalizeText(article.title);
  const context = normalizeText(
    `${article.summary ?? ""} ${article.source_description ?? ""}`,
  );

  return topic.keywords.reduce((score, keyword) => {
    const normalizedKeyword = keyword.toLocaleLowerCase();
    if (phraseAppears(title, normalizedKeyword)) return score + 3;
    if (phraseAppears(context, normalizedKeyword)) return score + 1;
    return score;
  }, 0);
}

function getBestTopic(article) {
  return TOPICS.reduce(
    (best, topic) => {
      const score = getTopicScore(article, topic);
      return score > best.score ? { topic, score } : best;
    },
    { topic: null, score: 0 },
  ).topic;
}

function validCreatedAt(article, windowStart, now) {
  const timestamp = Date.parse(article.created_at);
  return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp <= now;
}

function getPublisherKey(article) {
  return typeof article.source_name === "string"
    ? article.source_name.trim().toLocaleLowerCase()
    : "";
}

function getMomentum(articles, now) {
  const newestWindowStart = now - 24 * HOUR_MS;
  const previousWindowStart = now - 48 * HOUR_MS;
  const latest24Count = articles.filter(
    (article) => Date.parse(article.created_at) >= newestWindowStart,
  ).length;
  const previous24Count = articles.filter((article) => {
    const createdAt = Date.parse(article.created_at);
    return createdAt >= previousWindowStart && createdAt < newestWindowStart;
  }).length;
  const earlierCount = articles.length - latest24Count - previous24Count;

  if (latest24Count >= 2 && previous24Count === 0 && earlierCount === 0) {
    return { state: "Emerging", latest24Count, previous24Count };
  }

  if (
    latest24Count >= 2
    && latest24Count > previous24Count
    && previous24Count + earlierCount > 0
  ) {
    return { state: "Accelerating", latest24Count, previous24Count };
  }

  return { state: "Steady", latest24Count, previous24Count };
}

function getChartCounts(articles, windowStart) {
  const bucketCount = TREND_WINDOW_HOURS / TREND_BUCKET_HOURS;
  const counts = Array.from({ length: bucketCount }, () => 0);

  for (const article of articles) {
    const elapsedHours = (Date.parse(article.created_at) - windowStart) / HOUR_MS;
    const index = Math.min(
      counts.length - 1,
      Math.max(0, Math.floor(elapsedHours / TREND_BUCKET_HOURS)),
    );
    counts[index] += 1;
  }

  return counts;
}

function getTrendHeadline(topic, state) {
  if (state === "Accelerating") return `${topic.label} gains momentum`;
  if (state === "Emerging") return `${topic.label} emerges in recent coverage`;
  return `${topic.label} remains in focus`;
}

function getTrendAnalysis(topic, articles, publisherCount, momentum) {
  const storyLabel = articles.length === 1 ? "story" : "stories";
  const opening = `${publisherCount} publishers covered ${topic.subject} across ${articles.length} ${storyLabel} added to the briefing.`;

  if (momentum.latest24Count === articles.length) {
    return `${opening} All related coverage arrived during the latest 24 hours.`;
  }

  if (momentum.state === "Accelerating") {
    return `${opening} ${momentum.latest24Count} arrived during the latest 24 hours, more than in the preceding day.`;
  }

  return `${opening} Coverage was distributed across the three-day window rather than concentrated in one burst.`;
}

function toEvidence(article) {
  return {
    id: article.id,
    slug: typeof article.slug === "string" && article.slug.trim()
      ? article.slug.trim()
      : null,
    title: article.title,
    source_name: typeof article.source_name === "string" && article.source_name.trim()
      ? article.source_name.trim()
      : null,
    created_at: article.created_at,
  };
}

function withoutInternalScore(trend) {
  const publicTrend = { ...trend };
  delete publicTrend.score;
  return publicTrend;
}

export function analyzeTrendingNews(articles, nowValue = Date.now()) {
  const now = typeof nowValue === "number" ? nowValue : Date.parse(nowValue);
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const windowStart = safeNow - TREND_WINDOW_HOURS * HOUR_MS;
  const recentArticles = (Array.isArray(articles) ? articles : [])
    .filter(
      (article) =>
        article
        && typeof article.id === "string"
        && typeof article.title === "string"
        && article.title.trim()
        && validCreatedAt(article, windowStart, safeNow),
    )
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const grouped = new Map(TOPICS.map((topic) => [topic.id, { topic, articles: [] }]));

  for (const article of recentArticles) {
    const topic = getBestTopic(article);
    if (topic) grouped.get(topic.id).articles.push(article);
  }

  const trends = Array.from(grouped.values())
    .map(({ topic, articles: topicArticles }) => {
      const publishers = new Set(topicArticles.map(getPublisherKey).filter(Boolean));
      const publisherCount = publishers.size;
      if (
        topicArticles.length < MIN_TREND_STORIES
        || publisherCount < MIN_TREND_PUBLISHERS
      ) {
        return null;
      }

      const momentum = getMomentum(topicArticles, safeNow);
      const score =
        publisherCount * 100
        + topicArticles.length * 20
        + momentum.latest24Count * 10
        + (momentum.state === "Accelerating" ? 5 : 0);

      return {
        id: topic.id,
        label: topic.label,
        headline: getTrendHeadline(topic, momentum.state),
        state: momentum.state,
        story_count: topicArticles.length,
        publisher_count: publisherCount,
        latest_24h_count: momentum.latest24Count,
        analysis: getTrendAnalysis(topic, topicArticles, publisherCount, momentum),
        chart_counts: getChartCounts(topicArticles, windowStart),
        evidence: topicArticles
          .slice(0, MAX_EVIDENCE_ARTICLES)
          .map(toEvidence),
        score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, MAX_TRENDS)
    .map(withoutInternalScore);

  return {
    generated_at: new Date(safeNow).toISOString(),
    window_start: new Date(windowStart).toISOString(),
    recent_article_count: recentArticles.length,
    trends,
    latest_articles: recentArticles.slice(0, 3).map(toEvidence),
  };
}
