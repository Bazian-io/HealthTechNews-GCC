"use client";

import { ArticleImage } from "@/components/article-image";
import { Button } from "@/components/ui/button";
import {
  parseSavedStories,
  readSavedStories,
  removeSavedStory,
  SAVED_STORIES_STORAGE_KEY,
  toggleSavedStory,
  writeSavedStories,
} from "@/lib/saved-stories.mjs";
import { tidyExcerpt } from "@/lib/article-text.mjs";
import { cn } from "@/lib/utils";
import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

export type SaveableStory = {
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
};

type SavedStory = SaveableStory & {
  saved_at: string;
};

type SavedStoriesContextValue = {
  ready: boolean;
  stories: SavedStory[];
  isSaved: (id: string) => boolean;
  toggle: (story: SaveableStory) => void;
  remove: (id: string) => void;
};

const SavedStoriesContext = createContext<SavedStoriesContextValue | null>(null);
const EMPTY_STORIES: SavedStory[] = [];
const SERVER_SNAPSHOT = { ready: false, stories: EMPTY_STORIES };
let browserSnapshot: { ready: boolean; stories: SavedStory[] } = SERVER_SNAPSHOT;
let browserStoreInitialized = false;
const browserStoreListeners = new Set<() => void>();

function getBrowserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initializeBrowserStore() {
  if (browserStoreInitialized || typeof window === "undefined") return;
  browserStoreInitialized = true;
  browserSnapshot = {
    ready: true,
    stories: readSavedStories(getBrowserStorage()) as SavedStory[],
  };
}

function getBrowserSnapshot() {
  initializeBrowserStore();
  return browserSnapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function notifyBrowserStore() {
  browserStoreListeners.forEach((listener) => listener());
}

function replaceBrowserStories(nextStories: SavedStory[], persist = true) {
  initializeBrowserStore();
  browserSnapshot = { ready: true, stories: nextStories };
  if (persist) writeSavedStories(getBrowserStorage(), nextStories);
  notifyBrowserStore();
}

function syncSavedStories(event: StorageEvent) {
  if (event.key !== SAVED_STORIES_STORAGE_KEY && event.key !== null) return;
  replaceBrowserStories(parseSavedStories(event.newValue) as SavedStory[], false);
}

function subscribeToBrowserStore(listener: () => void) {
  initializeBrowserStore();
  browserStoreListeners.add(listener);
  if (browserStoreListeners.size === 1) {
    window.addEventListener("storage", syncSavedStories);
  }

  return () => {
    browserStoreListeners.delete(listener);
    if (browserStoreListeners.size === 0) {
      window.removeEventListener("storage", syncSavedStories);
    }
  };
}

function useSavedStories() {
  const value = useContext(SavedStoriesContext);
  if (!value) {
    throw new Error("Saved-story components need a saved-stories provider.");
  }
  return value;
}

export function SavedStoriesProvider({ children }: { children: ReactNode }) {
  const { ready, stories } = useSyncExternalStore(
    subscribeToBrowserStore,
    getBrowserSnapshot,
    getServerSnapshot,
  );

  const value = useMemo<SavedStoriesContextValue>(() => ({
    ready,
    stories,
    isSaved: (id) => stories.some((story) => story.id === id),
    toggle: (story) => {
      replaceBrowserStories(
        toggleSavedStory(getBrowserSnapshot().stories, story) as SavedStory[],
      );
    },
    remove: (id) => {
      replaceBrowserStories(
        removeSavedStory(getBrowserSnapshot().stories, id) as SavedStory[],
      );
    },
  }), [ready, stories]);

  return (
    <SavedStoriesContext.Provider value={value}>
      {children}
    </SavedStoriesContext.Provider>
  );
}

export function SavedStoriesLink() {
  const { ready, stories } = useSavedStories();
  const pathname = usePathname();
  const count = stories.length;
  const isCurrentPage = pathname === "/saved";

  return (
    <Link
      href="/saved"
      aria-label={ready ? `Saved stories, ${count}` : "Saved stories"}
      aria-current={isCurrentPage ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent hover:text-primary sm:px-3",
        isCurrentPage && "border-primary/40 bg-accent text-primary ring-1 ring-primary/10",
      )}
    >
      <Bookmark size={16} aria-hidden="true" />
      <span className="hidden sm:inline">Saved</span>
      {ready && count > 0 && (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold leading-none text-primary-foreground"
          aria-hidden="true"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export function SaveStoryButton({
  story,
  variant = "icon",
  className,
}: {
  story: SaveableStory;
  variant?: "icon" | "text";
  className?: string;
}) {
  const { ready, isSaved, toggle } = useSavedStories();
  const saved = isSaved(story.id);
  const label = saved ? "Remove from saved stories" : "Save story";
  const Icon = saved ? BookmarkCheck : Bookmark;

  return (
    <Button
      type="button"
      variant="outline"
      size={variant === "icon" ? "icon" : "sm"}
      disabled={!ready}
      aria-label={ready ? `${label}: ${story.title}` : "Loading saved stories"}
      aria-pressed={saved}
      title={ready ? label : "Loading saved stories"}
      onClick={() => toggle(story)}
      className={cn(
        variant === "icon" ? "rounded-md text-muted-foreground" : "gap-2",
        saved && "border-primary/35 bg-accent text-primary",
        className,
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {variant === "text" && <span>{saved ? "Saved" : "Save story"}</span>}
    </Button>
  );
}

function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en", options ?? {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SavedStoryItem({ story }: { story: SavedStory }) {
  const { remove } = useSavedStories();
  const publishedDate = formatDate(story.published_at);
  const savedDate = formatDate(story.saved_at, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const metadata = [story.source_name, story.country, story.category, publishedDate]
    .filter(Boolean)
    .join(" · ");
  const excerpt = story.summary || tidyExcerpt(story.source_description);

  return (
    <li className="rounded-lg border border-border bg-card p-6 shadow-panel sm:p-8">
      <article className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-8">
        <div className="flex min-w-0 gap-5">
          <ArticleImage
            src={story.image_url}
            sizes="(min-width: 640px) 10rem, 6rem"
            className="aspect-[4/3] w-24 shrink-0 self-start sm:w-40"
            fallback="hide"
          />
          <div className="min-w-0 flex-1">
            {savedDate && (
              <p className="editorial-kicker editorial-accent">
                Saved {savedDate}
              </p>
            )}
            <h2 className="mt-3 break-words font-editorial text-2xl font-medium leading-snug tracking-tight">
              {story.slug ? (
                <Link
                  href={`/news/${story.slug}`}
                  className="underline-offset-4 transition-colors hover:text-primary hover:underline"
                >
                  {story.title}
                </Link>
              ) : (
                story.title
              )}
            </h2>
            {metadata && (
              <p className="mt-3 text-xs font-medium leading-5 text-muted-foreground">
                {metadata}
              </p>
            )}
            {excerpt && (
              <div className="mt-4">
                {!story.summary && (
                  <p className="text-[0.6875rem] font-semibold uppercase leading-5 tracking-[0.12em] text-muted-foreground">
                    Publisher excerpt
                  </p>
                )}
                <p className="reading-copy mt-2 line-clamp-3">
                  {excerpt}
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-5 text-sm">
              {story.slug && (
                <Link
                  href={`/news/${story.slug}`}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Read article
                </Link>
              )}
              <a
                href={story.original_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Original source ↗
              </a>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => remove(story.id)}
          aria-label={`Remove from saved stories: ${story.title}`}
          className="w-fit gap-2 text-muted-foreground hover:text-foreground"
        >
          <Trash2 size={16} aria-hidden="true" />
          Remove
        </Button>
      </article>
    </li>
  );
}

export function SavedStoriesList() {
  const { ready, stories } = useSavedStories();

  if (!ready) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="mt-8">
        <span className="sr-only">Loading saved stories</span>
        <div className="space-y-4" aria-hidden="true">
          {[0, 1].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <section className="mt-10 rounded-lg border border-border bg-card px-6 py-10 text-center shadow-panel sm:p-14" aria-labelledby="saved-empty-heading">
        <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
          <Bookmark size={22} />
        </span>
        <h2 id="saved-empty-heading" className="mt-5 font-editorial text-2xl font-medium">
          No saved stories yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Save stories from the briefing and they will appear here for quick access.
        </p>
        <Link
          href="/#latest-news"
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Browse latest news
        </Link>
      </section>
    );
  }

  return (
    <section className="mt-8" aria-labelledby="saved-list-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 id="saved-list-heading" className="font-editorial text-2xl font-medium">
            Your reading list
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {stories.length} saved {stories.length === 1 ? "story" : "stories"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Newest saved first</p>
      </div>
      <ul className="mt-6 space-y-5">
        {stories.map((story) => <SavedStoryItem key={story.id} story={story} />)}
      </ul>
    </section>
  );
}
