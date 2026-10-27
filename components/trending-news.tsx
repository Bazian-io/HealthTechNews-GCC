"use client";

import { ArticleImage } from "@/components/article-image";
import Link from "next/link";
import { useState } from "react";
import { TREND_WINDOW_HOURS } from "@/lib/trending-news.mjs";

const TREND_WINDOW_DAYS = TREND_WINDOW_HOURS / 24;

type EvidenceArticle = {
  id: string;
  slug: string | null;
  title: string;
  source_name: string | null;
  image_url: string | null;
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
    "break-words font-editorial text-lg font-medium leading-snug underline-offset-4 transition-colors hover:text-primary hover:underline";

  if (!article.slug) {
    return <span className={className}>{article.title}</span>;
  }

  return (
    <Link href={`/news/${article.slug}`} className={className}>
      {article.title}
    </Link>
  );
}

function ArticleListItem({ article }: { article: EvidenceArticle }) {
  return (
    <li className="flex gap-4 py-3">
      <ArticleImage
        src={article.image_url}
        sizes="4rem"
        className="aspect-square w-16 shrink-0 self-start"
        fallback="hide"
      />
      <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        <ArticleLink article={article} />
        {article.source_name && (
          <span className="text-xs text-muted-foreground">
            {article.source_name}
          </span>
        )}
      </div>
    </li>
  );
}

function MomentumChart({ trend }: { trend: Trend }) {
  const maximum = Math.max(1, ...trend.chart_counts);
  const highlightedIndex = trend.chart_counts.reduce(
    (busiestIndex, count, index, counts) =>
      count >= counts[busiestIndex] ? index : busiestIndex,
    0,
  );
  const chartSummary = trend.chart_counts
    .map((count, index) => `day ${index + 1}: ${count}`)
    .join(", ");

  return (
    <figure className="dark-surface-depth min-w-0 rounded-lg border border-border/80 bg-muted/35 p-4 sm:p-5" aria-labelledby="trend-chart-caption">
      <div className="flex items-start justify-between gap-4 text-xs">
        <span className="font-medium leading-5 text-muted-foreground">Related stories by day</span>
        <span className="max-w-36 rounded-md border border-border bg-card/70 px-2.5 py-1.5 text-right font-medium leading-4 tabular-nums">
          {trend.latest_24h_count === trend.story_count
            ? "All activity arrived today"
            : `${trend.latest_24h_count} ${trend.latest_24h_count === 1 ? "story" : "stories"} in the latest 24h`}
        </span>
      </div>
      <div
        className="chart-grid mt-5 flex h-32 items-end lg:h-44 gap-1.5 border-b border-border px-1 sm:gap-2"
        role="img"
        aria-label={`Related stories added each day over the past ${trend.chart_counts.length} days, oldest to newest: ${chartSummary}`}
      >
        {trend.chart_counts.map((count, index) => (
          <span
            key={index}
            className={`block min-h-1 flex-1 rounded-t-md ${
              count === 0
                ? "bg-border"
                : index === highlightedIndex
                  ? "trend-bar-highlight"
                  : "trend-bar"
            }`}
            style={{ height: count > 0 ? `${Math.max(12, (count / maximum) * 100)}%` : "3%" }}
            title={`${count} ${count === 1 ? "story" : "stories"}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5 text-[0.6875rem] tabular-nums text-muted-foreground sm:gap-2" aria-hidden="true">
        {trend.chart_counts.map((_, index) => (
          <span
            key={index}
            className={`text-center ${
              index !== 0 && index !== 3 && index !== trend.chart_counts.length - 1
                ? "invisible sm:visible"
                : ""
            }`}
          >
            {index === trend.chart_counts.length - 1
              ? "Now"
              : `${TREND_WINDOW_DAYS - index}d`}
          </span>
        ))}
      </div>
      <figcaption id="trend-chart-caption" className="mt-4 text-xs leading-5 text-muted-foreground">
        Each bar shows related stories added that day. Burgundy marks the busiest day.
      </figcaption>
    </figure>
  );
}

function QuietTrendState({ analysis }: { analysis: TrendingNewsAnalysis }) {
  const articleCount = analysis.recent_article_count;

  return (
    <div className="mt-8 border-y border-border py-7 sm:py-8">
      <p className="editorial-kicker">
        A quieter week
      </p>
      <h3 className="mt-3 font-editorial text-3xl font-medium tracking-tight">
        No clear multi-source trend yet
      </h3>
      <p className="reading-copy mt-3 max-w-2xl">
        {articleCount === 0
          ? "No new published stories were added during this window."
          : `${articleCount} ${articleCount === 1 ? "story was" : "stories were"} added, but no subject was covered by at least two publishers.`} We only label a subject as trending when the evidence is broad enough.
      </p>

      {analysis.latest_articles.length > 0 && (
        <div className="mt-7">
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Latest developments
          </h4>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {analysis.latest_articles.map((article) => (
              <ArticleListItem key={article.id} article={article} />
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
      className="mt-12 scroll-mt-24 overflow-hidden rounded-lg border border-border bg-card px-6 py-7 shadow-panel sm:mt-14 sm:px-10 sm:py-9"
      aria-labelledby="trending-news-heading"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="editorial-kicker editorial-accent">
            Trending · This week
          </p>
          <h2
            id="trending-news-heading"
            className="mt-2 max-w-3xl font-editorial text-3xl font-medium leading-tight tracking-tight sm:text-[2rem]"
          >
            What is shaping GCC HealthTech right now
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Multi-source themes from this briefing, ranked by publisher breadth and recent momentum.
          </p>
        </div>
        {updatedAt && (
          <p className="shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">
            Updated {updatedAt} GCC time
          </p>
        )}
      </div>

      {!selectedTrend ? (
        <QuietTrendState analysis={analysis} />
      ) : (
        <>
          <div className="mt-7 grid gap-7 border-y border-border py-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)] lg:items-center lg:gap-10">
            <article aria-live="polite" aria-atomic="true">
              <h3 className="font-editorial text-3xl font-medium leading-[1.15] tracking-tight sm:text-[2.125rem]">
                {selectedTrend.headline}
              </h3>
              <p className="reading-copy mt-4 max-w-2xl">
                {selectedTrend.analysis}
              </p>
              <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
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
              <div className="mt-3 divide-y divide-border border-y border-border">
                {alsoTrending.map((trend) => (
                  <button
                    key={trend.id}
                    type="button"
                    onClick={() => setSelectedTrendId(trend.id)}
                    className="grid min-h-16 w-full gap-1 px-3 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
                    aria-label={`Show trend: ${trend.label}`}
                  >
                    <span className="font-editorial text-xl font-medium">
                      {trend.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {trend.story_count} stories · {trend.publisher_count} publishers
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <aside
            className="dark-surface-depth editorial-border mt-7 rounded-r-md border-l-2 bg-muted/45 px-5 py-5 sm:px-6"
            aria-labelledby="trend-evidence-heading"
            aria-live="polite"
          >
            <h3
              id="trend-evidence-heading"
              className="editorial-kicker editorial-accent"
            >
              Evidence behind this trend
            </h3>
            <ul className="mt-3 divide-y divide-border">
              {selectedTrend.evidence.map((article) => (
                <ArticleListItem key={article.id} article={article} />
              ))}
            </ul>
          </aside>
        </>
      )}
    </section>
  );
}
