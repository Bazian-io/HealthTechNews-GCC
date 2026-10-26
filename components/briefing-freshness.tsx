"use client";

import {
  countNewSinceVisit,
  isNewSinceVisit,
  startBriefingVisit,
} from "@/lib/article-freshness.mjs";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type VisitState = {
  ready: boolean;
  previousVisitAt: number | null;
  visitStartedAt: number | null;
};

type FreshnessContextValue = VisitState & {
  newArticleCount: number;
};

const FreshnessContext = createContext<FreshnessContextValue | null>(null);

function useBriefingFreshness() {
  const value = useContext(FreshnessContext);
  if (!value) {
    throw new Error("Briefing freshness components need a freshness provider.");
  }
  return value;
}

export function BriefingFreshnessProvider({
  articleTimestamps,
  children,
}: {
  articleTimestamps: string[];
  children: ReactNode;
}) {
  const initialized = useRef(false);
  const [visit, setVisit] = useState<VisitState>({
    ready: false,
    previousVisitAt: null,
    visitStartedAt: null,
  });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setVisit({
      ready: true,
      ...startBriefingVisit(window.localStorage),
    });
  }, []);

  const newArticleCount = useMemo(() => {
    if (!visit.ready || visit.previousVisitAt === null || visit.visitStartedAt === null) {
      return 0;
    }
    return countNewSinceVisit(
      articleTimestamps,
      visit.previousVisitAt,
      visit.visitStartedAt,
    );
  }, [articleTimestamps, visit]);

  return (
    <FreshnessContext.Provider value={{ ...visit, newArticleCount }}>
      {children}
    </FreshnessContext.Provider>
  );
}

export function BriefingFreshnessBanner() {
  const freshness = useBriefingFreshness();
  let title = "Preparing your daily briefing";
  let description = "Checking for stories added since your last visit.";

  if (freshness.ready && freshness.previousVisitAt === null) {
    title = "Your daily briefing is ready";
    description = "From your next visit, newly added stories will be highlighted. Visit history stays in this browser.";
  } else if (freshness.ready && freshness.newArticleCount === 0) {
    title = "You’re caught up";
    description = "No stories have been added since your last visit.";
  } else if (freshness.ready) {
    title = `${freshness.newArticleCount} new ${freshness.newArticleCount === 1 ? "story" : "stories"} since your last visit`;
    description = "New items are marked across Top stories and the news stream.";
  }

  return (
    <section
      className="mt-8 flex items-start gap-4 rounded-lg border border-border bg-muted/60 p-5 sm:p-6"
      aria-labelledby="briefing-freshness-heading"
    >
      <span
        aria-hidden="true"
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full bg-primary ${
            freshness.newArticleCount > 0 ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
        />
      </span>
      <div>
        <p className="editorial-kicker">
          Daily briefing
        </p>
        <h2
          id="briefing-freshness-heading"
          className="mt-1 font-editorial text-2xl font-medium tracking-tight"
          aria-live="polite"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </section>
  );
}

export function ArticleNewBadge({ createdAt }: { createdAt: string }) {
  const freshness = useBriefingFreshness();
  const isNew = freshness.ready
    && freshness.previousVisitAt !== null
    && freshness.visitStartedAt !== null
    && isNewSinceVisit(
      createdAt,
      freshness.previousVisitAt,
      freshness.visitStartedAt,
    );

  if (!isNew) return null;

  return (
    <span
      className="inline-flex rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-primary-foreground"
      aria-label="New since your last visit"
    >
      New
    </span>
  );
}
