import Link from "next/link";

export function ProductHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-primary/15 bg-background/90 backdrop-blur-md">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md border border-primary/20 bg-card px-4 py-2 text-sm font-semibold text-primary shadow-md focus:fixed focus:left-4 focus:top-4 focus:not-sr-only"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-6 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
        >
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm bg-primary transition-transform group-hover:rotate-45 motion-reduce:transition-none"
          />
          <span className="font-editorial text-lg font-semibold tracking-tight">
            GCC HealthTech News
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="flex items-center gap-4">
          <Link
            href="/#top-stories"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-primary sm:inline"
          >
            Top stories
          </Link>
          <Link
            href="/#latest-news"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Browse news
          </Link>
        </nav>
      </div>
    </header>
  );
}
