"use client";

import Link from "next/link";
import { useState } from "react";

type EvidenceArticle = {
  id: string;
  slug: string | null;
  title: string;
  source_name: string | null;
  created_at: string;
};

type Trend = {
  id: string;
  label: string;
  headline: string;
  state: "Accelerating" | "Emerging" | "Steady";
  story_count: number;
  publisher_count: number;
  latest_24h_count: number;
  analysis: string;
  chart_counts: number[];
  evidence: EvidenceArticle[];
};

export type TrendingNewsAnalysis = {
  generated_at: string;
  window_start: string;
  recent_article_count: number;
  trends: Trend[];
  latest_articles: EvidenceArticle[];
};

function formatUpdateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ArticleLink({ article }: { article: EvidenceArticle }) {
  const className =
    "break-words font-editorial text-base font-semibold leading-snug underline-offset-4 transition-colors hover:text-primary hover:underline";

  if (!article.slug) {
    return <span className={className}>{article.title}</span>;
  }

  return (
    <Link href={`/news/${article.slug}`} className={className}>
      {article.title}
    </Link>
  );
}

function MomentumChart({ trend }: { trend: Trend }) {
  const maximum = Math.max(1, ...trend.chart_counts);
  const chartSummary = trend.chart_counts
    .map((count, index) => `period ${index + 1}: ${count}`)
    .join(", ");

  return (
    <figure className="min-w-0" aria-labelledby="trend-chart-caption">
      <div className="flex items-start justify-between gap-4 text-xs">
        <span className="leading-5 text-muted-foreground">Coverage momentum</span>
        <span className="max-w-32 text-right font-semibold leading-5">
          {trend.latest_24h_count === trend.story_count
            ? "All activity arrived today"
            : `${trend.latest_24h_count} ${trend.latest_24h_count === 1 ? "story" : "stories"} in the latest 24h`}
        </span>
      </div>
      <div
        className="mt-4 flex h-32 items-end gap-2 border-b border-primary/20 px-2"
        role="img"
        aria-label={`Related stories in six 12-hour periods, oldest to newest: ${chartSummary}`}
      >
        {trend.chart_counts.map((count, index) => (
          <span
            key={index}
            className={`block min-h-1 flex-1 rounded-t-sm ${count > 0 ? "bg-primary" : "bg-primary/15"}`}
            style={{ height: count > 0 ? `${Math.max(12, (count / maximum) * 100)}%` : "3%" }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[0.65rem] text-muted-foreground" aria-hidden="true">
        <span>72h ago</span>
        <span>36h</span>
        <span>Now</span>
      </div>
      <figcaption id="trend-chart-caption" className="mt-4 text-xs leading-5 text-muted-foreground">
        Stories added to this briefing in 12-hour periods—not overall market activity.
      </figcaption>
    </figure>
  );
}

function QuietTrendState({ analysis }: { analysis: TrendingNewsAnalysis }) {
  const articleCount = analysis.recent_article_count;

  return (
    <div className="mt-8 border-y border-primary/15 py-7 sm:py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        A quieter three days
      </p>
      <h3 className="mt-3 font-editorial text-3xl font-semibold tracking-tight">
        No clear multi-source trend yet
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {articleCount === 0
          ? "No new published stories were added during this window."
          : `${articleCount} ${articleCount === 1 ? "story was" : "stories were"} added, but no subject was covered by at least two publishers.`} We only label a subject as trending when the evidence is broad enough.
      </p>

      {analysis.latest_articles.length > 0 && (
        <div className="mt-7">
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Latest developments
          </h4>
          <ul className="mt-3 divide-y divide-primary/10 border-y border-primary/10">
            {analysis.latest_articles.map((article) => (
              <li key={article.id} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                <ArticleLink article={article} />
                {article.source_name && (
                  <span className="text-xs text-muted-foreground">
                    {article.source_name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TrendingNews({ analysis }: { analysis: TrendingNewsAnalysis }) {
  const [selectedTrendId, setSelectedTrendId] = useState(
    analysis.trends[0]?.id ?? null,
  );
  const selectedTrend =
    analysis.trends.find((trend) => trend.id === selectedTrendId)
    ?? analysis.trends[0];
  const alsoTrending = analysis.trends
    .filter((trend) => trend.id !== selectedTrend?.id)
    .slice(0, 2);
  const updatedAt = formatUpdateTime(analysis.generated_at);

  return (
    <section
      id="trending-news"
      className="mt-10 overflow-hidden rounded-2xl border border-primary/20 bg-card px-6 py-8 shadow-sm sm:px-8 sm:py-10"
      aria-labelledby="trending-news-heading"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Trending · Last 72 hours
          </p>
          <h2
            id="trending-news-heading"
            className="mt-2 max-w-3xl font-editorial text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
          >
            What is shaping GCC HealthTech right now
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Multi-source themes from this briefing, ranked by publisher breadth and recent momentum.
          </p>
        </div>
        {updatedAt && (
          <p className="shrink-0 text-xs text-muted-foreground">
            Updated {updatedAt} GCC time
          </p>
        )}
      </div>

      {!selectedTrend ? (
        <QuietTrendState analysis={analysis} />
      ) : (
        <>
          <div className="mt-8 grid gap-8 border-y border-primary/15 py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)] lg:items-center lg:gap-14">
            <article aria-live="polite" aria-atomic="true">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                {selectedTrend.state}
              </p>
              <h3 className="mt-4 font-editorial text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {selectedTrend.headline}
              </h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                {selectedTrend.analysis}
              </p>
              <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span><strong className="font-semibold">{selectedTrend.story_count}</strong> related stories</span>
                <span><strong className="font-semibold">{selectedTrend.publisher_count}</strong> publishers</span>
              </p>
            </article>

            <MomentumChart trend={selectedTrend} />
          </div>

          {alsoTrending.length > 0 && (
            <div className="mt-7">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Also trending
              </h3>
              <div className="mt-3 divide-y divide-primary/15 border-y border-primary/15">
                {alsoTrending.map((trend) => (
                  <button
                    key={trend.id}
                    type="button"
                    onClick={() => setSelectedTrendId(trend.id)}
                    className="grid min-h-16 w-full gap-1 px-3 py-4 text-left transition-colors hover:bg-accent/45 focus-visible:bg-accent/45 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6"
                    aria-label={`Show trend: ${trend.label}`}
                  >
                    <span className="font-editorial text-lg font-semibold">
                      {trend.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {trend.story_count} stories · {trend.publisher_count} publishers
                    </span>
                    <span className="text-xs font-medium text-primary">
                      {trend.state} {trend.state === "Accelerating" ? "↑" : trend.state === "Emerging" ? "↗" : "→"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <aside
            className="mt-7 border-l-2 border-primary bg-accent/30 px-5 py-5 sm:px-6"
            aria-labelledby="trend-evidence-heading"
            aria-live="polite"
          >
            <h3 id="trend-evidence-heading" className="text-sm font-semibold">
              Evidence behind this trend
            </h3>
            <ul className="mt-3 divide-y divide-primary/10">
              {selectedTrend.evidence.map((article) => (
                <li key={article.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                  <ArticleLink article={article} />
                  {article.source_name && (
                    <span className="text-xs text-muted-foreground">
                      {article.source_name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </>
      )}
    </section>
  );
}
