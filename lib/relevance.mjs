import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

// The written rubric. README documents the same rule in prose; this constant is
// what the check actually applies, so change this first and mirror it there.
export const RUBRIC = `GCC HealthTech News covers the healthcare technology sector in the six GCC
states: Saudi Arabia, the United Arab Emirates, Bahrain, Kuwait, Oman, and Qatar.

The reader follows this sector professionally. An article earns a place only when
it says something concrete: something the reader can act on, or a specific
development they can read the sector's direction from.

Include an article when it reports one of these:

- TECHNOLOGY: health technology being deployed, launched, trialled, or
  demonstrated. Digital health, telemedicine, medical robotics, health AI,
  connected devices, health data platforms, hospital systems.
- EVENT: a healthcare or health technology exhibition, conference, or trade event
  held in the GCC, which the reader could attend.
- PARTNERSHIP: an agreement, investment, or programme that names concrete subject
  matter, meaning it states what is being built, researched, funded, or delivered.

Exclude an article when it is one of these:

- Diplomacy or courtesy: meetings, visits, or agreements described only as
  "strengthening cooperation" or "enhancing partnership", naming no subject.
- Statements of gratitude or praise directed at national leadership.
- Public health or awareness campaigns addressed to the general public.
- Appointments, nominations, awards, and ceremonies.

The deciding test for any agreement is whether concrete subject matter is named.
"Signs MoU on Research and Clinical Innovation" names a subject, so it is
included. "Signs MoU to Strengthen Partnership" names nothing, so it is excluded.

When an article is too vague to tell, exclude it. A thin feed is better than a
feed full of items that say nothing.`;

// Deliberately narrow. This only catches gratitude headlines, which the rubric
// excludes outright and which no technology term should rescue. Every other
// judgement is the model's; a broader keyword list would silently drop articles.
const GRATITUDE = /\b(thanks|commends|praises)\s+(the\s+)?leadership\b/i;
// Each alternative is boundary-checked at both ends: an unanchored "app" would
// match "Approving", which would quietly disable the rule above.
const TECHNOLOGY =
  /\b(technolog\w*|digital|virtual|robotic\w*|telemedicine|telehealth|artificial intelligence|AI|apps?|platforms?|software|data|devices?|innovation\w*|remote|online)\b/i;

export function obviouslyExcluded(article) {
  const title = article.title ?? "";
  if (!GRATITUDE.test(title)) return null;
  if (TECHNOLOGY.test(`${title} ${article.source_description ?? ""}`)) return null;
  return "Statement of gratitude to national leadership.";
}

export const RELEVANCE_TOOL = {
  name: "record_relevance",
  description: "Record whether this article belongs on GCC HealthTech News.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      relevant: {
        type: "boolean",
        description: "True only if the article meets the rubric.",
      },
      basis: {
        type: "string",
        enum: ["technology", "event", "partnership", "excluded"],
        description:
          "Which rule decided this. Use 'excluded' whenever relevant is false.",
      },
      reason: {
        type: "string",
        description: "One sentence naming what in the article decided it.",
      },
    },
    required: ["relevant", "basis", "reason"],
    additionalProperties: false,
  },
};

export function describeArticle(article) {
  return [
    `Headline: ${article.title}`,
    `Publisher: ${article.source_name ?? "unknown"}`,
    `Published: ${article.published_at?.slice(0, 10) ?? "unknown"}`,
    `Publisher description: ${article.source_description?.trim() || "(none provided)"}`,
  ].join("\n");
}

export function createRelevanceClient(env = process.env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Set ANTHROPIC_API_KEY before checking relevance. Keep it in .env.local, never with a NEXT_PUBLIC_ name.");
  }
  return new Anthropic({ apiKey });
}

/**
 * Decide whether one article belongs on the site. Never writes to the database:
 * a verdict here is not a decision to publish.
 */
export async function assessRelevance(article, { client, model = MODEL } = {}) {
  const ruled = obviouslyExcluded(article);
  if (ruled) {
    return { relevant: false, basis: "excluded", reason: ruled, decidedBy: "rule" };
  }
  if (!client) throw new Error("A Claude client is required to assess relevance.");

  // Thinking stays on. With it disabled, Opus 5 can write a tool call into its
  // visible text instead of a tool_use block, which would look like a silent pass.
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: RUBRIC,
    messages: [{ role: "user", content: describeArticle(article) }],
    tools: [RELEVANCE_TOOL],
    tool_choice: { type: "tool", name: RELEVANCE_TOOL.name },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to assess this article.");
  }
  const call = response.content.find(
    (block) => block.type === "tool_use" && block.name === RELEVANCE_TOOL.name,
  );
  if (!call) throw new Error("Claude returned no relevance verdict.");

  return { ...call.input, decidedBy: "model" };
}

/**
 * Assess many articles in sequence, collecting failures rather than aborting the
 * run. Mirrors the collector's result shape.
 */
export async function assessAll(articles, { client, model = MODEL } = {}) {
  const result = { checked: 0, relevant: 0, notRelevant: 0, failed: 0, verdicts: [], issues: [] };

  for (const [index, article] of articles.entries()) {
    try {
      const verdict = await assessRelevance(article, { client, model });
      result.checked++;
      if (verdict.relevant) result.relevant++;
      else result.notRelevant++;
      result.verdicts.push({ original_url: article.original_url, title: article.title, ...verdict });
    } catch (error) {
      result.failed++;
      result.issues.push(`Item ${index + 1}: ${error.message}`);
    }
  }
  return result;
}
