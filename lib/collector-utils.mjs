import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";

export function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// RSS keeps its MOH-only policy. Discovery sources can accept public publisher
// domains, without rewriting arbitrary HTTP URLs or adding/removing "www".
export function normalizeUrl(value, { mohOnly = false } = {}) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const isMoh = ["moh.gov.sa", "www.moh.gov.sa"].includes(url.hostname);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.port ||
      (mohOnly && !isMoh) ||
      !url.hostname.includes(".") || isIP(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)
    ) return null;

    // Preserve the original RSS canonical form for cross-source duplicates.
    if (isMoh) {
      url.protocol = "https:";
      url.hostname = "www.moh.gov.sa";
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid", "msclkid"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.href;
  } catch {
    return null;
  }
}

// Callers supply a validated, normalized URL and only source-supported metadata.
export function makeDraft({ title, originalUrl, sourceName, sourceDescription, publishedAt }, collectedAt) {
  title = cleanText(title);
  if (!title || !originalUrl) return null;
  const titleSlug = title.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100).replace(/-$/, "") || "article";
  const suffix = createHash("sha256").update(originalUrl).digest("hex").slice(0, 12);
  const publishedDate = new Date(publishedAt || "");
  return {
    title,
    original_url: originalUrl,
    slug: `${titleSlug}-${suffix}`,
    status: "draft",
    summary: null,
    country: null,
    category: null,
    published_at: Number.isNaN(publishedDate.getTime()) ? null : publishedDate.toISOString(),
    source_name: cleanText(sourceName) || null,
    source_description: cleanText(sourceDescription) || null,
    collected_at: collectedAt,
  };
}

export function createCollectorClient(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before collecting. Use --dry-run to preview without database access.");
  }
  if (!key.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY must be a Supabase backend secret key, not a publishable key.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15_000) }),
    },
  });
}

export async function saveArticles(articles, { source, supabase, dryRun = false, previewLimit = 3 } = {}) {
  if (!dryRun && !supabase) throw new Error("A backend Supabase client is required to save articles.");
  const seen = new Set();
  const result = {
    source, dryRun, found: articles.length,
    saved: 0, duplicates: 0, invalid: 0, failed: 0, previewed: 0,
    issues: [],
  };
  if (dryRun) result.preview = [];

  for (const [index, draft] of articles.entries()) {
    if (!draft) {
      result.invalid++;
      result.issues.push(`Item ${index + 1}: missing title or unsupported article URL.`);
      continue;
    }
    if (seen.has(draft.original_url)) {
      result.duplicates++;
      continue;
    }
    seen.add(draft.original_url);
    if (dryRun) {
      result.previewed++;
      if (result.preview.length < previewLimit) {
        result.preview.push({ title: draft.title, original_url: draft.original_url, published_at: draft.published_at });
      }
      continue;
    }
    try {
      // Ignore duplicates across sources, repeat runs, and overlapping runs.
      const { data, error } = await supabase.from("articles")
        .upsert(draft, { onConflict: "original_url", ignoreDuplicates: true })
        .select("id");
      if (error) {
        const code = /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : "unknown";
        result.failed++;
        result.issues.push(`Item ${index + 1}: database save failed (code ${code}).`);
      } else if (data?.length) {
        result.saved++;
      } else {
        result.duplicates++;
      }
    } catch {
      result.failed++;
      result.issues.push(`Item ${index + 1}: database request failed. Check the connection.`);
    }
  }
  return result;
}

// Existing RSS/GDELT callers still construct and save drafts only.
export const saveDrafts = saveArticles;
