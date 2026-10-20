import { ProductFooter } from "@/components/product-footer";
import { ProductHeader } from "@/components/product-header";

export default function ArticleLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ProductHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 focus:outline-none sm:px-8 sm:py-12"
        aria-busy="true"
      >
        <span className="sr-only" role="status" aria-live="polite">
          Loading article
        </span>
        <div
          className="h-4 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none"
          aria-hidden="true"
        />

        <article className="mx-auto mt-10 max-w-3xl sm:mt-14" aria-hidden="true">
          <div className="h-3 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-5 h-10 w-full animate-pulse rounded bg-muted motion-reduce:animate-none sm:h-14" />
          <div className="mt-3 h-10 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none sm:h-14" />

          <div className="mt-8 grid gap-5 rounded-xl border border-primary/15 bg-card p-5 sm:grid-cols-2 sm:p-6">
            <div className="h-10 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-10 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>

          <div className="space-y-4 py-10 sm:py-12">
            <div className="h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-24 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>

          <div className="space-y-4 rounded-xl border border-primary/15 bg-accent/45 p-6 sm:p-8">
            <div className="h-6 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-10 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        </article>
      </main>

      <ProductFooter />
    </div>
  );
}
