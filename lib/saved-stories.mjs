import { safeImageUrl } from "./article-images.mjs";

export const SAVED_STORIES_STORAGE_KEY = "gcc-healthtech-news:saved-stories";
export const MAX_SAVED_STORIES = 100;

function requiredText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function optionalText(value, maxLength) {
  if (value === null || value === undefined) return null;
  return requiredText(value, maxLength);
}

function safeUrl(value) {
  const text = requiredText(value, 2_000);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return text;
  } catch {
    return null;
  }
}

function optionalDate(value) {
  const text = optionalText(value, 100);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function safeSlug(value) {
  const slug = optionalText(value, 300);
  return slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

export function normalizeSavedStory(value, savedAt) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const id = requiredText(value.id, 200);
  const title = requiredText(value.title, 500);
  const originalUrl = safeUrl(value.original_url);
  const savedAtValue = optionalDate(value.saved_at) ?? optionalDate(savedAt);

  if (!id || !title || !originalUrl || !savedAtValue) return null;

  return {
    id,
    slug: safeSlug(value.slug),
    title,
    summary: optionalText(value.summary, 4_000),
    source_name: optionalText(value.source_name, 300),
    source_description: optionalText(value.source_description, 4_000),
    original_url: originalUrl,
    // Stories saved before images existed simply have no image.
    image_url: safeImageUrl(value.image_url),
    country: optionalText(value.country, 200),
    category: optionalText(value.category, 200),
    published_at: optionalDate(value.published_at),
    saved_at: savedAtValue,
  };
}

export function parseSavedStories(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) return [];

  try {
    const value = JSON.parse(rawValue);
    if (!Array.isArray(value)) return [];

    const normalized = value
      .map((story) => normalizeSavedStory(story))
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.saved_at) - Date.parse(left.saved_at));
    const seen = new Set();

    return normalized
      .filter((story) => {
        if (seen.has(story.id)) return false;
        seen.add(story.id);
        return true;
      })
      .slice(0, MAX_SAVED_STORIES);
  } catch {
    return [];
  }
}

export function toggleSavedStory(stories, story, savedAt = new Date().toISOString()) {
  const existingStories = Array.isArray(stories) ? stories : [];

  if (existingStories.some((savedStory) => savedStory.id === story?.id)) {
    return existingStories.filter((savedStory) => savedStory.id !== story.id);
  }

  const normalized = normalizeSavedStory(story, savedAt);
  if (!normalized) return existingStories;

  return [normalized, ...existingStories].slice(0, MAX_SAVED_STORIES);
}

export function removeSavedStory(stories, id) {
  if (!Array.isArray(stories)) return [];
  return stories.filter((story) => story.id !== id);
}

export function readSavedStories(storage) {
  try {
    return parseSavedStories(storage?.getItem(SAVED_STORIES_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeSavedStories(storage, stories) {
  try {
    storage?.setItem(SAVED_STORIES_STORAGE_KEY, JSON.stringify(stories));
    return Boolean(storage);
  } catch {
    return false;
  }
}
