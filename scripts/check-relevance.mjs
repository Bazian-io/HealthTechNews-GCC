import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createCollectorClient } from "../lib/news-collector.mjs";
import { assessAll, createRelevanceClient } from "../lib/relevance.mjs";

// This script never writes. A relevance verdict is not a decision to publish,
// and storing verdicts waits on its own migration.
const FIELDS = "title, original_url, source_name, source_description, published_at";
const GOLD = fileURLToPath(new URL("../tests/fixtures/relevance-gold.json", import.meta.url));

async function readDrafts() {
  const supabase = createCollectorClient();
  const { data, error } = await supabase
    .from("articles")
    .select(FIELDS)
    .eq("status", "draft")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    const code = /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : "unknown";
    throw new Error(`database read failed (code ${code}).`);
  }
  return data ?? [];
}

function scoreAgainstGold(verdicts) {
  const gold = JSON.parse(readFileSync(GOLD, "utf8"));
  const labels = new Map(gold.articles.map((entry) => [entry.original_url, entry]));
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  const disagreements = [];

  for (const verdict of verdicts) {
    const label = labels.get(verdict.original_url);
    if (!label || label.verdict === "borderline") continue;

    const expected = label.verdict === "relevant";
    if (verdict.relevant && expected) counts.truePositive++;
    else if (verdict.relevant && !expected) counts.falsePositive++;
    else if (!verdict.relevant && !expected) counts.trueNegative++;
    else counts.falseNegative++;

    if (verdict.relevant !== expected) disagreements.push({ verdict, label });
  }
  return { counts, disagreements, compared: Object.values(counts).reduce((a, b) => a + b, 0) };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? "n/a" : `${numerator}/${denominator} (${Math.round((numerator / denominator) * 100)}%)`;
}

function report({ counts, disagreements, compared }) {
  const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = counts;
  console.log(`\nScored against ${compared} labelled article${compared === 1 ? "" : "s"}. Borderline labels are skipped.\n`);
  console.log("                      labelled relevant   labelled not relevant");
  console.log(`  said relevant       ${String(tp).padStart(17)}   ${String(fp).padStart(21)}`);
  console.log(`  said not relevant   ${String(fn).padStart(17)}   ${String(tn).padStart(21)}\n`);
  console.log(`  Agreement  ${ratio(tp + tn, compared)}`);
  console.log(`  Precision  ${ratio(tp, tp + fp)}   of what it published, how much belonged`);
  console.log(`  Recall     ${ratio(tp, tp + fn)}   of what belonged, how much it found`);

  if (disagreements.length === 0) {
    console.log("\nNo disagreements.");
    return;
  }
  console.log(`\n${disagreements.length} disagreement${disagreements.length === 1 ? "" : "s"}:`);
  for (const { verdict, label } of disagreements) {
    console.log(`\n  ${verdict.title}`);
    console.log(`    check says ${verdict.relevant ? "relevant" : "not relevant"} (${verdict.basis}): ${verdict.reason}`);
    console.log(`    label says ${label.verdict}: ${label.reason}`);
  }
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: npm run check:relevance [-- --gold]\n\nAssess collected drafts against the written GCC HealthTech rubric.\nNothing is written to the database.\n--gold also scores the result against tests/fixtures/relevance-gold.json.");
} else if (args.some((arg) => arg !== "--gold")) {
  console.error("Unknown option. Use npm run check:relevance -- --help.");
  process.exitCode = 1;
} else {
  try {
    // Existing environment variables win; .env.local takes precedence over .env.
    for (const filename of [".env.local", ".env"]) {
      const path = fileURLToPath(new URL(`../${filename}`, import.meta.url));
      if (existsSync(path)) loadEnvFile(path);
    }
    const client = createRelevanceClient();
    const drafts = await readDrafts();
    if (drafts.length === 0) {
      console.log("No drafts found. Run npm run collect:news first.");
    } else {
      console.log(`Assessing ${drafts.length} drafts. This calls Claude once per article.`);
      const result = await assessAll(drafts, { client });

      for (const verdict of result.verdicts) {
        console.log(`${verdict.relevant ? "KEEP" : "drop"}  ${verdict.title}`);
        console.log(`      ${verdict.basis} · ${verdict.reason}`);
      }
      console.log(`\nchecked ${result.checked}, relevant ${result.relevant}, not relevant ${result.notRelevant}, failed ${result.failed}`);
      for (const issue of result.issues) console.log(`  ${issue}`);

      if (args.includes("--gold")) report(scoreAgainstGold(result.verdicts));
      if (result.failed > 0) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Relevance check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
