import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createCollectorClient } from "../lib/news-collector.mjs";

// Row-level security hides drafts from the website's publishable key, so this
// listing reuses the collector's backend client. It only reads.
const MAX_DRAFTS = 500;
const DESCRIPTION_PREVIEW = 240;
const FIELDS =
  "title, slug, original_url, source_name, source_description, published_at, collected_at";

function shorten(value) {
  if (!value) return "(no source description)";
  return value.length > DESCRIPTION_PREVIEW
    ? `${value.slice(0, DESCRIPTION_PREVIEW - 1).trimEnd()}…`
    : value;
}

function printReadable(drafts) {
  console.log(`${drafts.length} draft${drafts.length === 1 ? "" : "s"} (newest first)\n`);
  for (const [index, draft] of drafts.entries()) {
    console.log(`${String(index + 1).padStart(3)}. ${draft.title}`);
    console.log(`     ${draft.published_at?.slice(0, 10) ?? "no date"} · ${draft.source_name ?? "unknown source"}`);
    console.log(`     ${draft.original_url}`);
    console.log(`     ${shorten(draft.source_description)}\n`);
  }
  console.log("Country, category, and summary stay empty until the processing stage runs.");
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: npm run drafts:list [-- --json]\n\nList collected draft articles so they can be reviewed for GCC HealthTech relevance.\n--json prints the full rows instead of a readable summary.");
} else if (args.some((arg) => arg !== "--json")) {
  console.error("Unknown option. Use npm run drafts:list -- --help.");
  process.exitCode = 1;
} else {
  try {
    // Existing environment variables win; .env.local takes precedence over .env.
    for (const filename of [".env.local", ".env"]) {
      const path = fileURLToPath(new URL(`../${filename}`, import.meta.url));
      if (existsSync(path)) loadEnvFile(path);
    }
    const supabase = createCollectorClient();
    const { data, error } = await supabase
      .from("articles")
      .select(FIELDS)
      .eq("status", "draft")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(MAX_DRAFTS);

    if (error) {
      // Report the code only, matching the collector: messages can carry private detail.
      const code = /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : "unknown";
      throw new Error(`database read failed (code ${code}).`);
    }

    const drafts = data ?? [];
    if (args.includes("--json")) {
      console.log(JSON.stringify(drafts, null, 2));
    } else if (drafts.length === 0) {
      console.log("No drafts found. Run npm run collect:news first.");
    } else {
      printReadable(drafts);
    }
  } catch (error) {
    console.error(`Listing failed: ${error.message}`);
    process.exitCode = 1;
  }
}
