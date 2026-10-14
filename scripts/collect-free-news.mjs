import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCollectorClient } from "../lib/collector-utils.mjs";
import { buildFreeNewsSearches, collectFreeNews, FREE_NEWS_COUNTRIES } from "../lib/free-news-collector.mjs";

const HELP = `Usage: npm run collect:free-news -- [--dry-run] [--country COUNTRY] [--days DAYS]

Find GCC HealthTech stories through FreeNewsAPI.ai and publish new matching articles.
--dry-run previews results without loading credentials or accessing Supabase.
--country limits searches to: ${Object.keys(FREE_NEWS_COUNTRIES).join(", ")}.
--days sets the lookback window (1-30; default 30).
No API key, membership, or paid AI service is required.
Existing stored articles are never overwritten or promoted from draft.`;

export function parseArgs(args) {
  const options = { dryRun: false, days: 30 };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--country") {
      options.country = args[++index];
      if (!Object.hasOwn(FREE_NEWS_COUNTRIES, options.country)) throw new Error("Invalid --country. Use --help for the supported countries.");
    } else if (arg === "--days") {
      const value = args[++index];
      if (!/^\d+$/.test(value ?? "")) throw new Error("--days must be a whole number between 1 and 30.");
      options.days = Number(value);
    } else throw new Error("Unknown option. Use npm run collect:free-news -- --help.");
  }
  buildFreeNewsSearches(options);
  return options;
}

function loadEnvironment() {
  for (const filename of [".env.local", ".env"]) {
    const path = fileURLToPath(new URL(`../${filename}`, import.meta.url));
    if (existsSync(path)) loadEnvFile(path);
  }
}

export async function run(args, {
  collect = collectFreeNews, createClient = createCollectorClient,
  loadEnv = loadEnvironment, print = console.log, progress = console.error,
} = {}) {
  if (args.includes("--help")) { print(HELP); return 0; }
  const options = parseArgs(args);
  let supabase;
  if (!options.dryRun) { loadEnv(); supabase = createClient(); }
  progress(options.dryRun
    ? "Searching FreeNewsAPI.ai… Preview only; nothing will be saved."
    : "Searching FreeNewsAPI.ai… New matching stories will be published to the configured Supabase database.");
  const result = await collect({ ...options, supabase });
  print(JSON.stringify(result, null, 2));
  return result.failed > 0 || result.searches.failed > 0 || result.searches.skipped > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await run(process.argv.slice(2)); }
  catch (error) { console.error(`FreeNewsAPI collection failed: ${error.message}`); process.exitCode = 1; }
}
