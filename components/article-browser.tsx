"use client";

import { ArticleImage } from "@/components/article-image";
import { ArticleNewBadge } from "@/components/briefing-freshness";
import { SaveStoryButton } from "@/components/saved-stories";
import { getArticleDayGroup } from "@/lib/article-freshness.mjs";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;
const GCC_COUNTRIES = [
  { label: "Saudi Arabia", aliases: ["Saudi Arabia", "Saudi"] },
  {
    label: "United Arab Emirates",
    aliases: ["United Arab Emirates", "UAE", "U.A.E."],
  },
  { label: "Qatar", aliases: ["Qatar"] },
  { label: "Kuwait", aliases: ["Kuwait"] },
  { label: "Bahrain", aliases: ["Bahrain"] },
  { label: "Oman", aliases: ["Oman"] },
] as const;

type BrowseArticle = {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  source_name: string | null;
  source_description: string | null;
  original_url: string;
  image_url: string | null;
  country: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
};

const DAY_GROUPS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "earlier", label: "Earlier" },
] as const;

function getOptions(values: Array<string | null>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeCountry(value: string) {
  return value.trim().toLocaleLowerCase().replaceAll(".", "");
}

function getCountryOption(value: string) {
  const normalizedValue = normalizeCountry(value);

  return GCC_COUNTRIES.find((option) =>
    option.aliases.some(
      (alias) => normalizeCountry(alias) === normalizedValue,
    ),
  );
}

function matchesCountry(articleCountry: string | null, selectedCountry: string) {
  if (!selectedCountry) {
    return true;
  }

  if (!articleCountry?.trim()) {
    return false;
  }

  const countryOption = getCountryOption(selectedCountry);

  if (!countryOption) {
    return normalizeCountry(articleCountry) === normalizeCountry(selectedCountry);
  }

  return countryOption.aliases.some(
    (alias) => normalizeCountry(alias) === normalizeCountry(articleCountry),
  );
}

function getArticleMetadata(article: BrowseArticle) {
  const publishedDate = article.published_at
    ? new Date(article.published_at)
    : null;
  const formattedDate =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? publishedDate.toLocaleDateString("en", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  return [
    article.source_name,
    article.country,
    article.category,
    formattedDate,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ArticleBrowser({
  articles,
  briefingTime,
}: {
  articles: BrowseArticle[];
  briefingTime: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const country = searchParams.get("country") ?? "";
  const category = searchParams.get("topic") ?? "";
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categories = useMemo(
    () => getOptions(articles.map((article) => article.category)),
    [articles],
  );
  const selectedCountry = getCountryOption(country)?.label ?? country;

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const hasActiveFilters = Boolean(normalizedSearch || country || category);
  const articlesToBrowse = hasActiveFilters ? articles : articles.slice(4);
  const matchingArticles = articlesToBrowse.filter((article) => {
    const searchableText = [
      article.title,
      article.summary,
      article.source_description,
      article.source_name,
      article.country,
      article.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    return (
      (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
      matchesCountry(article.country, country) &&
      (!category || article.category?.trim() === category)
    );
  });
  const visibleArticles = matchingArticles.slice(0, visibleCount);
  const remainingCount = matchingArticles.length - visibleArticles.length;
  const groupedArticles = DAY_GROUPS.map((group) => ({
    ...group,
    articles: visibleArticles.filter(
      (article) => getArticleDayGroup(article.created_at, briefingTime) === group.id,
    ),
  })).filter((group) => group.articles.length > 0);

  function updateFilter(name: "q" | "country" | "topic", value: string) {
    const params = new URLSearchParams(window.location.search);

    if (value.trim()) {
      params.set(name, value);
    } else {
      params.delete(name);
    }

    const query = params.toString();
    const nextUrl = `${pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    const params = new URLSearchParams(window.location.search);
    params.delete("q");
    params.delete("country");
    params.delete("topic");

    const query = params.toString();
    const nextUrl = `${pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section
      id="latest-news"
      className="scroll-mt-24 border-t border-border pt-10 sm:pt-12"
      aria-labelledby="latest-news-heading"
    >
      <div>
        <p className="editorial-kicker">
          The news stream
        </p>
        <h2
          id="latest-news-heading"
          className="mt-2 font-editorial text-3xl font-medium leading-tight tracking-tight sm:text-[2rem]"
        >
          Browse news
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Search all published stories or browse the six GCC countries. Topic
          choices appear when that information is available. Stories are grouped
          by when they were added to the briefing.
        </p>
      </div>

      <div className="mt-7 flex flex-col gap-5 rounded-lg border border-border bg-card p-5 shadow-panel md:flex-row md:items-end sm:p-6">
        <label className="min-w-0 flex-1 text-sm font-medium" htmlFor="news-search">
          Search
          <input
            id="news-search"
            type="search"
            value={search}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Search headlines, publishers, or topics"
            className="news-control min-w-0"
          />
        </label>

        <label className="text-sm font-medium md:w-56" htmlFor="country-filter">
          Country
          <select
            id="country-filter"
            value={selectedCountry}
            onChange={(event) => updateFilter("country", event.target.value)}
            className="news-control"
          >
            <option value="">All countries</option>
            {GCC_COUNTRIES.map((option) => (
              <option key={option.label} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {categories.length > 0 && (
          <label className="text-sm font-medium md:w-48" htmlFor="category-filter">
            Topic
            <select
              id="category-filter"
              value={category}
              onChange={(event) => updateFilter("topic", event.target.value)}
              className="news-control"
            >
              <option value="">All topics</option>
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-11 w-fit rounded-md border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-accent"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p aria-live="polite" aria-atomic="true">
          {hasActiveFilters
            ? `${matchingArticles.length} ${matchingArticles.length === 1 ? "result" : "results"}`
            : "Recent stories following today’s top stories"}
        </p>
        <p className="font-medium text-foreground">Newest first</p>
      </div>

      {visibleArticles.length > 0 ? (
        <div className="mt-5 space-y-8">
          {groupedArticles.map((group) => (
            <section key={group.id} aria-labelledby={`news-group-${group.id}`}>
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <h3
                  id={`news-group-${group.id}`}
                  className="font-editorial text-2xl font-medium tracking-tight"
                >
                  {group.label}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {group.articles.length} {group.articles.length === 1 ? "story" : "stories"} shown
                </p>
              </div>
              <div className="divide-y divide-border border-b border-border">
                {group.articles.map((article) => {
                  const metadata = getArticleMetadata(article);

                  return (
                    <article
                      key={article.id}
                      className="grid gap-4 px-3 py-6 transition-colors hover:bg-card sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:px-4"
                    >
                      <div className="flex gap-4 sm:gap-5">
                        <ArticleImage
                          src={article.image_url}
                          sizes="(min-width: 640px) 8rem, 6rem"
                          className="aspect-[4/3] w-24 shrink-0 sm:w-32"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <ArticleNewBadge createdAt={article.created_at} />
                            {metadata && (
                              <p className="text-xs font-medium leading-5 text-muted-foreground">
                                {metadata}
                              </p>
                            )}
                          </div>
                          <h4>
                            {article.slug?.trim() ? (
                              <Link
                                href={`/news/${article.slug}`}
                                className="break-words font-editorial text-[1.375rem] font-medium leading-snug underline-offset-4 transition-colors hover:text-primary hover:underline"
                              >
                                {article.title}
                              </Link>
                            ) : (
                              <span className="break-words font-editorial text-[1.375rem] font-medium leading-snug">
                                {article.title}
                              </span>
                            )}
                          </h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:justify-end">
                        <a
                          href={article.original_url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-fit text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Original source ↗
                        </a>
                        <SaveStoryButton story={article} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-3 border-y py-6 text-sm text-muted-foreground">
          {hasActiveFilters
            ? "No published articles match these filters."
            : "More news will appear here as it is published."}
        </p>
      )}

      {remainingCount > 0 && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((count) =>
                Math.min(count + PAGE_SIZE, matchingArticles.length),
              )
            }
            className="min-h-11 rounded-md border border-border bg-card px-6 py-2 text-sm font-medium text-primary shadow-panel transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Show {Math.min(PAGE_SIZE, remainingCount)} more
          </button>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {visibleArticles.length} of {matchingArticles.length} stories
          </p>
        </div>
      )}
    </section>
  );
}
