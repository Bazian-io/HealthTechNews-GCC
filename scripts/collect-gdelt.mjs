import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCollectorClient } from "../lib/collector-utils.mjs";
import { collectGdeltNews, COUNTRIES } from "../lib/gdelt-collector.mjs";

const HELP = `Usage: npm run collect:gdelt -- [--dry-run] [--country COUNTRY] [--days DAYS]

Discover GCC HealthTech articles through GDELT and save drafts only.
--dry-run previews up to 10 articles without loading credentials or accessing Supabase.
--country limits searches to: ${Object.keys(COUNTRIES).join(", ")}.
--days sets the lookback window (1-90; default 7).
No GDELT API key or AI service is required.`;

export function parseArgs(args) {
  const options = { dryRun: false, days: 7 };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--country") {
      options.country = args[++index];
      if (!Object.hasOwn(COUNTRIES, options.country)) throw new Error("Invalid --country. Use --help for the supported countries.");
    } else if (arg === "--days") {
      const value = args[++index];
      if (!/^\d+$/.test(value ?? "") || Number(value) < 1 || Number(value) > 90) {
        throw new Error("--days must be a whole number between 1 and 90.");
      }
      options.days = Number(value);
    } else throw new Error("Unknown option. Use npm run collect:gdelt -- --help.");
  }
  return options;
}

function loadEnvironment() {
  for (const filename of [".env.local", ".env"]) {
    const path = fileURLToPath(new URL(`../${filename}`, import.meta.url));
    if (existsSync(path)) loadEnvFile(path);
  }
}

// Dependencies can be replaced in offline CLI tests; no import starts a run.
export async function run(args, {
  collect = collectGdeltNews, createClient = createCollectorClient,
  loadEnv = loadEnvironment, print = console.log,
} = {}) {
  if (args.includes("--help")) {
    print(HELP);
    return 0;
  }
  const options = parseArgs(args);
  let supabase;
  if (!options.dryRun) {
    loadEnv();
    supabase = createClient();
  }
  const result = await collect({ ...options, supabase });
  print(JSON.stringify(result, null, 2));
  return result.failed > 0 || result.searches.failed > 0 || result.searches.skipped > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`GDELT collection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
