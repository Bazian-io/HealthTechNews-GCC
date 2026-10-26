import { ProductFooter } from "@/components/product-footer";
import { ProductHeader } from "@/components/product-header";
import Link from "next/link";

export default function ArticleNotFound() {
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
          aria-labelledby="not-found-heading"
        >
          <p className="editorial-kicker">
            Article
          </p>
          <h1
            id="not-found-heading"
            className="mt-3 font-editorial text-4xl font-medium tracking-tight"
          >
            Article not found
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            This article doesn&apos;t exist or hasn&apos;t been published.
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
