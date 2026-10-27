// Publisher text helpers. Text is plain and untrusted; callers render it as text.

export const LEAD_MIN_WORDS = 150;
export const LEAD_MAX_WORDS = 200;
// Below this, the usable opening is too thin to be worth showing.
const LEAD_FLOOR_WORDS = 50;
// Shorter lines are usually page furniture ("Advertisement", "Listen to this article").
const MIN_PARAGRAPH_WORDS = 10;
const ABBREVIATION = /\b(?:Inc|Ltd|Co|Corp|Dr|Mr|Mrs|Ms|Prof|St|No|vs|[A-Z])\.["”’)\]]?$/;
// Share-button text captured before the story ("Facebook Twitter LinkedIn ...").
// Two or more in a row, so a story that starts with one such name is kept.
const SHARE_BUTTONS = /^(?:(?:Share|Facebook|Twitter|X|LinkedIn|WhatsApp|Telegram|Email|E-mail|Print|Pinterest|Reddit|Copy link)\b[\s:|,·•]*){2,}/i;

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function comparable(text) {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function splitSentences(paragraph) {
  const parts = paragraph.split(/(?<=[.!?]["”’)\]]?)\s+(?=["“‘(]?[\p{Lu}\p{N}])/u);
  const sentences = [];
  for (const part of parts) {
    // "Baxter International Inc. (NYSE:BAX)" and "the U.S. State Department" stay whole.
    if (sentences.length && ABBREVIATION.test(sentences.at(-1))) {
      sentences[sentences.length - 1] += ` ${part}`;
    } else {
      sentences.push(part);
    }
  }
  return sentences;
}

// The first complete sentences of an article, about 150-200 words, as
// paragraphs separated by a blank line. The rest of the article is discarded.
export function extractLead(text, title) {
  if (typeof text !== "string") return null;
  const headline = typeof title === "string" ? comparable(title) : "";
  const paragraphs = text.replace(/\r/g, "").split(/\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim().replace(SHARE_BUTTONS, ""))
    .filter((paragraph) => wordCount(paragraph) >= MIN_PARAGRAPH_WORDS)
    .filter((paragraph) => comparable(paragraph) !== headline);

  const lead = [];
  let total = 0;
  for (const paragraph of paragraphs) {
    if (total >= LEAD_MIN_WORDS) break;
    const kept = [];
    for (const sentence of splitSentences(paragraph)) {
      if (total >= LEAD_MIN_WORDS) break;
      const words = sentence.split(/\s+/).filter(Boolean);
      if (total + words.length > LEAD_MAX_WORDS) {
        // One very long sentence: stop at the word limit and mark the cut.
        const room = LEAD_MAX_WORDS - total;
        if (room > 0) kept.push(`${words.slice(0, room).join(" ").replace(/[,;:–—-]+$/, "")}…`);
        total = LEAD_MAX_WORDS;
        break;
      }
      kept.push(sentence);
      total += words.length;
    }
    if (kept.length) lead.push(kept.join(" "));
  }

  if (total < LEAD_FLOOR_WORDS) return null;
  const result = lead.join("\n\n");
  return result.length <= 2_000 ? result : null;
}

// Publishers often cut descriptions at a fixed length, mid-word or mid-sentence.
// Show a clean ending instead of a broken word.
export function tidyExcerpt(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/\s+/g, " ").trim()
    .replace(/\s*(?:\.{3}|…)?\s*\[?Read more\]?\.?$/i, "")
    .trim();
  if (!cleaned) return null;
  if (/[.!?…]["”’)\]]?$/.test(cleaned)) return cleaned;

  const shortened = cleaned.replace(/\s+\S*$/, "").replace(/[\s,;:–—([-]+$/, "");
  return `${shortened || cleaned}…`;
}

export function leadParagraphs(lead) {
  return typeof lead === "string"
    ? lead.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    : [];
}
