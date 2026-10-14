import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { collectNews, createCollectorClient } from "../lib/news-collector.mjs";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: npm run collect:news [-- --dry-run]\n\nCollect the Ministry of Health feed into Supabase drafts.\n--dry-run previews the feed without accessing the database.");
} else if (args.some((arg) => arg !== "--dry-run")) {
  console.error("Unknown option. Use npm run collect:news -- --help.");
  process.exitCode = 1;
} else {
  try {
    // Existing environment variables win; .env.local takes precedence over .env.
    for (const filename of [".env.local", ".env"]) {
      const path = fileURLToPath(new URL(`../${filename}`, import.meta.url));
      if (existsSync(path)) loadEnvFile(path);
    }
    const dryRun = args.includes("--dry-run");
    const supabase = dryRun ? undefined : createCollectorClient();
    const result = await collectNews({ supabase, dryRun });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`Collection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
