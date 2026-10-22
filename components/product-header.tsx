import { SavedStoriesLink } from "@/components/saved-stories";
import { ThemeSwitcher } from "@/components/theme-switcher";
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
        <Link href="/" className="group flex items-center gap-2.5">
          <svg
            aria-hidden="true"
            viewBox="0 0 64 64"
            className="h-6 w-6 shrink-0"
          >
            <rect width="64" height="64" rx="16" fill="#0b1a1c" />
            <path
              d="M32 11 53 32 32 53 11 32Z"
              className="origin-center fill-primary transition-transform group-hover:rotate-45 motion-reduce:transition-none"
            />
            <rect x="25" y="25" width="14" height="14" rx="4" fill="#f7f3e8" />
          </svg>
          <span className="font-editorial text-lg font-semibold tracking-tight">
            GCC HealthTech<span className="hidden sm:inline"> News</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
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
              Browse<span className="hidden sm:inline"> news</span>
            </Link>
          </nav>
          <SavedStoriesLink />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
