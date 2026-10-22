export const LAST_VISIT_STORAGE_KEY = "gcc-healthtech-news:last-visit";

const BRIEFING_TIME_ZONE = "Asia/Riyadh";
const DAY_MS = 24 * 60 * 60 * 1_000;
const dayFormatter = new Intl.DateTimeFormat("en", {
  timeZone: BRIEFING_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function timestamp(value) {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function briefingDay(value) {
  const parsed = timestamp(value);
  if (parsed === null) return null;

  const parts = Object.fromEntries(
    dayFormatter
      .formatToParts(new Date(parsed))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
}

export function getArticleDayGroup(createdAt, currentTime) {
  const articleDay = briefingDay(createdAt);
  const currentDay = briefingDay(currentTime);
  if (articleDay === null || currentDay === null) return "earlier";

  const difference = currentDay - articleDay;
  if (difference <= 0) return "today";
  if (difference === 1) return "yesterday";
  return "earlier";
}

export function isNewSinceVisit(createdAt, previousVisitAt, visitStartedAt) {
  const created = timestamp(createdAt);
  const previous = timestamp(previousVisitAt);
  const started = timestamp(visitStartedAt);

  return created !== null
    && previous !== null
    && started !== null
    && created > previous
    && created <= started;
}

export function countNewSinceVisit(createdAtValues, previousVisitAt, visitStartedAt) {
  return createdAtValues.filter((createdAt) =>
    isNewSinceVisit(createdAt, previousVisitAt, visitStartedAt)).length;
}

export function startBriefingVisit(storage, startedAt = Date.now()) {
  const safeStartedAt = timestamp(startedAt) ?? Date.now();
  let previousVisitAt = null;

  try {
    const storedVisit = timestamp(storage.getItem(LAST_VISIT_STORAGE_KEY));
    if (storedVisit !== null && storedVisit <= safeStartedAt) {
      previousVisitAt = storedVisit;
    }
  } catch {
    // Storage can be unavailable in privacy modes. The briefing still works.
  }

  try {
    storage.setItem(LAST_VISIT_STORAGE_KEY, new Date(safeStartedAt).toISOString());
  } catch {
    // Visit tracking is an optional browser enhancement.
  }

  return { previousVisitAt, visitStartedAt: safeStartedAt };
}
