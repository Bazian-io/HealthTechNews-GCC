import { ArticleBrowser } from "@/components/article-browser";
import {
  ArticleNewBadge,
  BriefingFreshnessBanner,
  BriefingFreshnessProvider,
} from "@/components/briefing-freshness";
import { ProductFooter } from "@/components/product-footer";
import { ProductHeader } from "@/components/product-header";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";

// This page fetches articles at request time (Cache Components' "instant
// navigation" prerender check would otherwise flag that as blocking). We'll
// revisit caching once there's real content to cache.
export const instant = false;

type Article = {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  source_name: string | null;
  source_description: string | null;
  original_url: string;
  country: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
};

async function getPublishedArticles(): Promise<{
  articles: Article[];
  hasError: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select("id, slug, title, summary, source_name, source_description, original_url, country, category, published_at, created_at")
    .eq("status", "published")
    // Recently added stories stay visible even when their source date is unknown.
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load published articles:", error);
  }

  return { articles: data ?? [], hasError: Boolean(error) };
}

function getArticleMetadata(article: Article) {
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

function ArticleHeadline({
  article,
  className,
}: {
  article: Article;
  className: string;
}) {
  if (!article.slug?.trim()) {
    return <span className={className}>{article.title}</span>;
  }

  return (
    <Link
      href={`/news/${article.slug}`}
      className={`${className} underline-offset-4 hover:underline`}
    >
      {article.title}
    </Link>
  );
}

function ArticleMetadata({ article }: { article: Article }) {
  const metadata = getArticleMetadata(article);

  if (!metadata) {
    return null;
  }

  return (
    <p className="text-xs leading-5 text-muted-foreground">{metadata}</p>
  );
}

function ArticleExcerpt({ article }: { article: Article }) {
  const excerpt = article.summary || article.source_description;

  if (!excerpt) {
    return null;
  }

  return (
    <div className="space-y-2">
      {!article.summary && (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Publisher excerpt
        </p>
      )}
      <p className="leading-7 text-muted-foreground">{excerpt}</p>
    </div>
  );
}

async function HomeArticles() {
  const { articles, hasError } = await getPublishedArticles();
  const featuredArticle = articles[0];
  const secondaryArticles = articles.slice(1, 4);
  const briefingTime = new Date().toISOString();

  if (hasError) {
    return (
      <section
        className="my-10 rounded-xl border border-primary/15 bg-card p-6 shadow-sm sm:p-8"
        aria-labelledby="articles-error-heading"
      >
        <h2
          id="articles-error-heading"
          className="font-editorial text-2xl font-semibold"
        >
          Unable to load the briefing
        </h2>
        <p role="alert" className="mt-3 text-sm text-muted-foreground">
          We couldn&apos;t load the articles. Please try again later.
        </p>
      </section>
    );
  }

  if (articles.length === 0) {
    return (
      <section
        className="my-10 rounded-xl border border-primary/15 bg-card p-6 shadow-sm sm:p-8"
        aria-labelledby="empty-briefing-heading"
      >
        <h2
          id="empty-briefing-heading"
          className="font-editorial text-2xl font-semibold"
        >
          The briefing is being prepared
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          No published articles yet.
        </p>
      </section>
    );
  }

  return (
    <BriefingFreshnessProvider
      articleTimestamps={articles.map((article) => article.created_at)}
    >
      <BriefingFreshnessBanner />
      <section
        id="top-stories"
        className="scroll-mt-6 py-10 sm:py-14"
        aria-labelledby="top-stories-heading"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Today&apos;s briefing
            </p>
            <h2
              id="top-stories-heading"
              className="mt-2 font-editorial text-3xl font-semibold tracking-tight"
            >
              Top stories
            </h2>
          </div>
        </div>

        <div
          className={
            secondaryArticles.length > 0
              ? "grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]"
              : "grid"
          }
        >
          <article className="flex flex-col justify-between gap-8 rounded-xl border border-primary/20 bg-card p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Featured
                </p>
                <ArticleNewBadge createdAt={featuredArticle.created_at} />
              </div>
              <h3>
                <ArticleHeadline
                  article={featuredArticle}
                  className="break-words font-editorial text-3xl font-semibold leading-tight tracking-tight transition-colors hover:text-primary sm:text-4xl"
                />
              </h3>
              <ArticleMetadata article={featuredArticle} />
              <ArticleExcerpt article={featuredArticle} />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              {featuredArticle.slug?.trim() && (
                <Link
                  href={`/news/${featuredArticle.slug}`}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Read article
                </Link>
              )}
              <a
                href={featuredArticle.original_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Original source ↗
              </a>
            </div>
          </article>

          {secondaryArticles.length > 0 && (
            <div className="divide-y overflow-hidden rounded-xl border border-primary/15 bg-card shadow-sm">
              {secondaryArticles.map((article) => (
                <article
                  key={article.id}
                  className="space-y-3 p-5 transition-colors hover:bg-accent/35 sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ArticleNewBadge createdAt={article.created_at} />
                    <ArticleMetadata article={article} />
                  </div>
                  <h3>
                    <ArticleHeadline
                      article={article}
                      className="break-words font-editorial text-xl font-semibold leading-snug tracking-tight transition-colors hover:text-primary"
                    />
                  </h3>
                  <a
                    href={article.original_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Original source ↗
                  </a>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <ArticleBrowser articles={articles} briefingTime={briefingTime} />
    </BriefingFreshnessProvider>
  );
}

function HomeArticlesLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the latest articles</span>
      <div className="mt-10 h-32 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden="true" />
      <section className="py-10 sm:py-14" aria-hidden="true">
        <div className="mb-6 space-y-3">
          <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-7 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
          <div className="space-y-5 rounded-xl border border-primary/15 bg-card p-6 sm:p-8">
            <div className="h-3 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-8 w-5/6 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-20 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
          <div className="space-y-5 rounded-xl border border-primary/15 bg-card p-6">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-16 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-16 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        </div>
      </section>
      <section className="border-t pt-10 sm:pt-12" aria-hidden="true">
        <div className="h-7 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-6 h-20 w-full animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="mt-6 space-y-5 border-y py-5">
          <div className="h-12 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-12 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ProductHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 focus:outline-none sm:px-8 sm:py-14 lg:py-16"
      >
        <section className="relative max-w-4xl overflow-hidden rounded-2xl border border-primary/15 bg-card px-6 py-8 shadow-sm sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/70 blur-3xl"
          />
          <div className="relative">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              GCC HealthTech briefing
            </p>
            <h1 className="max-w-3xl font-editorial text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Health technology news from across the Gulf.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Follow digital health, medical AI, telemedicine, devices,
              startups, investments, and partnerships across the six GCC
              markets.
            </p>
          </div>
        </section>

        <Suspense fallback={<HomeArticlesLoading />}>
          <HomeArticles />
        </Suspense>
      </main>

      <ProductFooter />
    </div>
  );
}
