import { ProductFooter } from "@/components/product-footer";
import { ProductHeader } from "@/components/product-header";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

// Same reasoning as the homepage: this fetches per-request Supabase data,
// so it's marked as allowed to block rather than prerendered.
export const instant = false;

async function getPublishedArticleBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select("title, summary, source_name, source_description, country, category, original_url, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("Failed to load published article:", error);
  }

  return { article: data, hasError: Boolean(error) };
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

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
            className="rounded-xl border border-primary/15 bg-card p-6 shadow-sm sm:p-8"
            aria-labelledby="article-error-heading"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Article
            </p>
            <h1
              id="article-error-heading"
              className="mt-3 font-editorial text-4xl font-semibold tracking-tight"
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

  const publishedDate = formatPublishedDate(article.published_at);
  const excerpt = article.summary || article.source_description;
  const excerptLabel = article.summary
    ? "Summary"
    : article.source_description
      ? "Publisher excerpt"
      : "Article summary";
  const metadata = [
    { label: "Publisher", value: article.source_name },
    { label: "Country", value: article.country },
    { label: "Topic", value: article.category },
    { label: "Published", value: publishedDate },
  ].filter((item) => item.value);

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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              GCC HealthTech briefing
            </p>
            <h1 className="mt-4 break-words font-editorial text-4xl font-semibold leading-[1.06] tracking-tight sm:text-6xl">
              {article.title}
            </h1>

            {metadata.length > 0 && (
              <dl className="mt-8 grid gap-x-8 gap-y-5 rounded-xl border border-primary/15 bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
                {metadata.map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </header>

          <section
            className="py-10 sm:py-12"
            aria-labelledby="article-summary-heading"
          >
            <h2
              id="article-summary-heading"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-primary"
            >
              {excerptLabel}
            </h2>
            {excerpt ? (
              <p className="mt-4 font-editorial text-xl leading-8 sm:text-2xl sm:leading-10">
                {excerpt}
              </p>
            ) : (
              <p className="mt-4 leading-7 text-muted-foreground">
                No summary is available for this article. Visit the original
                publisher to continue reading.
              </p>
            )}
          </section>

          <aside
            className="rounded-xl border border-primary/15 bg-accent/45 p-6 sm:p-8"
            aria-labelledby="source-heading"
          >
            <h2
              id="source-heading"
              className="font-editorial text-2xl font-semibold"
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

          <div className="py-8">
            <Link
              href="/"
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              ← Back to latest news
            </Link>
          </div>
        </article>
      </main>

      <ProductFooter />
    </div>
  );
}
