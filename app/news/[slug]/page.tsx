import { ProductFooter } from "@/components/product-footer";
import { ProductHeader } from "@/components/product-header";
import { SaveStoryButton } from "@/components/saved-stories";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

// Same reasoning as the homepage: this fetches per-request Supabase data,
// so it's marked as allowed to block rather than prerendered.
export const instant = false;

type Article = {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  source_name: string | null;
  source_description: string | null;
  country: string | null;
  category: string | null;
  original_url: string;
  published_at: string | null;
};

type DiscoveryArticle = Pick<
  Article,
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "source_name"
  | "source_description"
  | "country"
  | "category"
  | "original_url"
  | "published_at"
>;

function normalizeLabel(value: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function getDiscoveryScore(
  currentArticle: Article,
  candidate: DiscoveryArticle,
) {
  let score = 0;

  if (
    normalizeLabel(currentArticle.category) &&
    normalizeLabel(currentArticle.category) === normalizeLabel(candidate.category)
  ) {
    score += 2;
  }

  if (
    normalizeLabel(currentArticle.country) &&
    normalizeLabel(currentArticle.country) === normalizeLabel(candidate.country)
  ) {
    score += 1;
  }

  return score;
}

function rankDiscoveryArticles(
  currentArticle: Article,
  candidates: DiscoveryArticle[],
) {
  return candidates
    .filter(
      (candidate) =>
        candidate.id !== currentArticle.id && candidate.slug?.trim(),
    )
    .map((candidate, index) => ({
      candidate,
      index,
      score: getDiscoveryScore(currentArticle, candidate),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.index - right.index,
    )
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

const getPublishedArticleBySlug = cache(async (slug: string) => {
  const supabase = await createClient();
  const articleResult = await supabase
    .from("articles")
    .select("id, slug, title, summary, source_name, source_description, country, category, original_url, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<Article>();

  if (articleResult.error) {
    console.error("Failed to load published article:", articleResult.error);
  }

  return {
    article: articleResult.data,
    hasError: Boolean(articleResult.error),
  };
});

async function getDiscoveryArticles(currentArticle: Article) {
  const supabase = await createClient();
  const discoveryResult = await supabase
    .from("articles")
    .select("id, slug, title, summary, source_name, source_description, country, category, original_url, published_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(13)
    .returns<DiscoveryArticle[]>();

  if (discoveryResult.error) {
    console.error(
      "Failed to load article discovery stories:",
      discoveryResult.error,
    );
  }

  return {
    articles: discoveryResult.error
      ? []
      : rankDiscoveryArticles(currentArticle, discoveryResult.data ?? []),
    hasError: Boolean(discoveryResult.error),
  };
}

function formatPublishedDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getCompactMetadata(article: DiscoveryArticle) {
  return [
    article.source_name,
    article.country,
    article.category,
    formatPublishedDate(article.published_at),
  ]
    .filter(Boolean)
    .join(" · ");
}

function getDiscoveryLabel(
  currentArticle: Article,
  candidate: DiscoveryArticle,
) {
  const sameTopic =
    Boolean(normalizeLabel(currentArticle.category)) &&
    normalizeLabel(currentArticle.category) === normalizeLabel(candidate.category);
  const sameCountry =
    Boolean(normalizeLabel(currentArticle.country)) &&
    normalizeLabel(currentArticle.country) === normalizeLabel(candidate.country);

  if (sameTopic && sameCountry) {
    return "Same topic and country";
  }

  if (sameTopic) {
    return "Same topic";
  }

  if (sameCountry) {
    return "Same country";
  }

  return "Latest coverage";
}

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { article } = await getPublishedArticleBySlug(slug);

  if (!article) {
    return { title: "Article" };
  }

  const description =
    article.summary?.trim() || article.source_description?.trim() || undefined;
  const publishedDate = article.published_at
    ? new Date(article.published_at)
    : null;
  const publishedTime =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? publishedDate.toISOString()
      : undefined;

  return {
    title: article.title,
    description,
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: `/news/${slug}`,
      publishedTime,
      images: [
        {
          url: "/opengraph-image.png",
          width: 1200,
          height: 630,
          alt: "GCC HealthTech News — Health technology news from across the Gulf.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [
        {
          url: "/twitter-image.png",
          alt: "GCC HealthTech News — Health technology news from across the Gulf.",
        },
      ],
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const { article, hasError } = await getPublishedArticleBySlug(slug);

  if (hasError) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <ProductHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16 focus:outline-none sm:px-8"
        >
          <section
            className="rounded-lg border border-border bg-card p-6 shadow-panel sm:p-8"
            aria-labelledby="article-error-heading"
          >
            <p className="editorial-kicker">
              Article
            </p>
            <h1
              id="article-error-heading"
              className="mt-3 font-editorial text-4xl font-medium tracking-tight"
            >
              Unable to load article
            </h1>
            <p role="alert" className="mt-4 text-sm text-muted-foreground">
              We couldn&apos;t load this article. Please try again later.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              ← Back to latest news
            </Link>
          </section>
        </main>
        <ProductFooter />
      </div>
    );
  }

  if (!article) {
    notFound();
  }

  const {
    articles: discoveryArticles,
    hasError: discoveryHasError,
  } = await getDiscoveryArticles(article);

  const publishedDate = formatPublishedDate(article.published_at);
  const excerpt = article.summary || article.source_description;
  const excerptLabel = article.summary
    ? "Summary"
    : article.source_description
      ? "Publisher excerpt"
      : "Article summary";
  const metadata: Array<{
    label: string;
    value: string;
    browseFilter?: "country" | "topic";
  }> = [];

  if (article.source_name) {
    metadata.push({ label: "Publisher", value: article.source_name });
  }
  if (article.country) {
    metadata.push({
      label: "Country",
      value: article.country,
      browseFilter: "country",
    });
  }
  if (article.category) {
    metadata.push({
      label: "Topic",
      value: article.category,
      browseFilter: "topic",
    });
  }
  if (publishedDate) {
    metadata.push({ label: "Published", value: publishedDate });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ProductHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 focus:outline-none sm:px-8 sm:py-12"
      >
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link
            href="/"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Latest news
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Article</span>
        </nav>

        <article className="mx-auto mt-10 max-w-3xl sm:mt-14">
          <header>
            <p className="editorial-kicker">
              GCC HealthTech briefing
            </p>
            <h1 className="mt-4 break-words font-editorial text-4xl font-medium leading-[1.1] tracking-tight sm:text-[3.5rem]">
              {article.title}
            </h1>

            {metadata.length > 0 && (
              <dl className="mt-8 grid gap-x-8 gap-y-5 rounded-lg border border-border bg-card p-5 shadow-panel sm:grid-cols-2 sm:p-6">
                {metadata.map((item) => (
                  <div key={item.label}>
                    <dt className="text-[0.6875rem] font-semibold uppercase leading-5 tracking-[0.12em] text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="mt-2 break-words text-sm font-medium">
                      {item.browseFilter ? (
                        <Link
                          href={{
                            pathname: "/",
                            query: { [item.browseFilter]: item.value },
                            hash: "latest-news",
                          }}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.value}
                        </Link>
                      ) : (
                        item.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-6">
              <SaveStoryButton story={article} variant="text" />
            </div>
          </header>

          <section
            className="py-10 sm:py-12"
            aria-labelledby="article-summary-heading"
          >
            <h2
              id="article-summary-heading"
              className="editorial-kicker editorial-accent"
            >
              {excerptLabel}
            </h2>
            {excerpt ? (
              <p className="mt-4 font-editorial text-xl leading-8 sm:text-2xl sm:leading-10">
                {excerpt}
              </p>
            ) : (
              <p className="reading-copy mt-4">
                No summary is available for this article. Visit the original
                publisher to continue reading.
              </p>
            )}
          </section>

          <aside
            className="rounded-lg border border-border bg-card p-6 shadow-panel sm:p-8"
            aria-labelledby="source-heading"
          >
            <h2
              id="source-heading"
              className="font-editorial text-2xl font-medium"
            >
              Continue with the original source
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Open the publisher&apos;s website to read the source article.
            </p>
            <a
              href={article.original_url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Read original source ↗
            </a>
          </aside>
        </article>

        {(discoveryArticles.length > 0 || discoveryHasError) && (
          <section
            className="mx-auto mt-14 max-w-5xl border-t border-border pt-10 sm:mt-16 sm:pt-12"
            aria-labelledby="continue-exploring-heading"
          >
            <p className="editorial-kicker">
              From the briefing
            </p>
            <h2
              id="continue-exploring-heading"
              className="mt-2 font-editorial text-3xl font-medium leading-tight tracking-tight sm:text-[2rem]"
            >
              Continue exploring
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              More published coverage, prioritizing stories with the same topic
              or country when that information is available.
            </p>

            {discoveryHasError ? (
              <p role="status" className="mt-6 text-sm text-muted-foreground">
                More stories are unavailable right now.
              </p>
            ) : (
              <ul className="mt-6 grid gap-4 md:grid-cols-3">
                {discoveryArticles.map((discoveryArticle) => {
                  const discoveryMetadata =
                    getCompactMetadata(discoveryArticle);

                  return (
                    <li
                      key={discoveryArticle.id}
                      className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-6 shadow-panel transition-shadow hover:shadow-panel-hover"
                    >
                      <p className="editorial-kicker">
                        {getDiscoveryLabel(article, discoveryArticle)}
                      </p>
                      <h3 className="mt-3">
                        <Link
                          href={`/news/${discoveryArticle.slug}`}
                          className="break-words font-editorial text-[1.375rem] font-medium leading-snug underline-offset-4 transition-colors hover:text-primary hover:underline"
                        >
                          {discoveryArticle.title}
                        </Link>
                      </h3>
                      {discoveryMetadata && (
                        <p className="mt-4 text-xs font-medium leading-5 text-muted-foreground">
                          {discoveryMetadata}
                        </p>
                      )}
                      <SaveStoryButton
                        story={discoveryArticle}
                        className="mt-5 self-end"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <div className="mx-auto max-w-5xl py-8 sm:py-10">
          <Link
            href="/"
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            ← Back to latest news
          </Link>
        </div>
      </main>

      <ProductFooter />
    </div>
  );
}
