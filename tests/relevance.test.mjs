import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assessAll,
  assessRelevance,
  createRelevanceClient,
  describeArticle,
  obviouslyExcluded,
  RELEVANCE_TOOL,
  RUBRIC,
} from "../lib/relevance.mjs";

const article = (fields = {}) => ({
  title: "Seha Virtual Hospital Performs 11 Remote Robotic Surgeries",
  original_url: "https://www.moh.gov.sa/en/example.aspx",
  source_name: "Saudi Ministry of Health",
  source_description: "Seha Virtual Hospital has successfully performed 11 consecutive remote robotic surgeries.",
  published_at: "2026-08-11T00:00:00.000Z",
  ...fields,
});

// Stands in for the Claude client. Records what was sent so the request shape
// can be asserted without any network access.
function claude(reply) {
  const sent = [];
  return {
    sent,
    messages: {
      async create(request) {
        sent.push(request);
        return typeof reply === "function" ? reply(request) : reply;
      },
    },
  };
}

const verdict = (input) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", name: RELEVANCE_TOOL.name, input }],
});

test("gratitude headlines are excluded without asking the model", () => {
  assert.ok(obviouslyExcluded(article({ title: "Minister of Health Thanks Leadership for Approving Emergency Safety Policy", source_description: null })));
  assert.ok(obviouslyExcluded(article({ title: "Health Minister Commends Leadership for Saudi Healthy Cities Lead", source_description: null })));
});

test("the gratitude rule defers to the model when technology is mentioned", () => {
  // A headline can thank leadership and still report a real deployment.
  assert.equal(obviouslyExcluded(article({ title: "Minister Thanks Leadership for Approving the National Telemedicine Platform", source_description: null })), null);
  assert.equal(obviouslyExcluded(article({ title: "Health Minister Thanks Leadership for Enabling CBAHI's Global Services", source_description: "A new digital accreditation platform." })), null);
});

test("ordinary headlines are left for the model to judge", () => {
  assert.equal(obviouslyExcluded(article()), null);
  assert.equal(obviouslyExcluded(article({ title: "Saudi Arabia and France Sign MoU to Enhance Health Cooperation" })), null);
});

test("missing publisher fields are described without inventing values", () => {
  const described = describeArticle(article({ source_description: "   ", published_at: null, source_name: null }));
  assert.match(described, /\(none provided\)/);
  assert.match(described, /Published: unknown/);
  assert.match(described, /Publisher: unknown/);
  assert.doesNotMatch(described, /null|undefined/);
});

test("a verdict is read back from the model's tool call", async () => {
  const client = claude(verdict({ relevant: true, basis: "technology", reason: "Reports a telesurgery deployment." }));
  const result = await assessRelevance(article(), { client });

  assert.deepEqual(result, {
    relevant: true,
    basis: "technology",
    reason: "Reports a telesurgery deployment.",
    decidedBy: "model",
  });
});

test("the request carries the rubric and forces a schema-valid verdict", async () => {
  const client = claude(verdict({ relevant: false, basis: "excluded", reason: "Diplomatic visit." }));
  await assessRelevance(article(), { client });

  const [request] = client.sent;
  assert.equal(request.system, RUBRIC);
  assert.equal(request.model, "claude-opus-5");
  assert.deepEqual(request.tool_choice, { type: "tool", name: "record_relevance" });
  assert.equal(request.tools[0].strict, true);
  assert.equal(request.tools[0].input_schema.additionalProperties, false);
  // Thinking is left on: disabling it lets Opus 5 emit a tool call as plain text.
  assert.equal(request.thinking, undefined);
});

test("an article settled by the rule never reaches the model", async () => {
  const client = claude(() => assert.fail("the model should not have been called"));
  const result = await assessRelevance(
    article({ title: "Health Minister Thanks Leadership for Enabling CBAHI's Global Services", source_description: null }),
    { client },
  );

  assert.equal(result.relevant, false);
  assert.equal(result.decidedBy, "rule");
  assert.equal(client.sent.length, 0);
});

test("a missing verdict or a refusal is an error, not a silent pass", async () => {
  const noCall = claude({ stop_reason: "end_turn", content: [{ type: "text", text: "Looks relevant to me." }] });
  await assert.rejects(() => assessRelevance(article(), { client: noCall }), /no relevance verdict/);

  const refused = claude({ stop_reason: "refusal", content: [] });
  await assert.rejects(() => assessRelevance(article(), { client: refused }), /declined/);
});

test("a failed article is counted without stopping the run", async () => {
  let call = 0;
  const client = claude(() => {
    call++;
    if (call === 2) throw new Error("connection reset");
    return verdict({ relevant: call === 1, basis: call === 1 ? "event" : "excluded", reason: "…" });
  });

  const result = await assessAll([article(), article(), article()], { client });

  assert.equal(result.checked, 2);
  assert.equal(result.relevant, 1);
  assert.equal(result.notRelevant, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /Item 2/);
});

test("a missing API key produces a clear configuration error", () => {
  assert.throws(() => createRelevanceClient({}), /ANTHROPIC_API_KEY/);
  assert.throws(() => createRelevanceClient({}), /NEXT_PUBLIC_/);
});

test("the labelled set is internally consistent", () => {
  const path = fileURLToPath(new URL("./fixtures/relevance-gold.json", import.meta.url));
  const gold = JSON.parse(readFileSync(path, "utf8"));
  const allowed = new Set(["relevant", "not_relevant", "borderline"]);

  assert.equal(gold.articles.length, 20);
  assert.equal(new Set(gold.articles.map((entry) => entry.original_url)).size, 20);
  for (const entry of gold.articles) {
    assert.ok(allowed.has(entry.verdict), `unexpected verdict: ${entry.verdict}`);
    assert.ok(entry.reason?.length > 0, `missing reason for: ${entry.title}`);
  }
  // Every case has been settled; a borderline left here means the rubric is undecided.
  assert.equal(gold.articles.filter((entry) => entry.verdict === "borderline").length, 0);
});
