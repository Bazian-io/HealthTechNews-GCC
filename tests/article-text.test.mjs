import assert from "node:assert/strict";
import test from "node:test";
import {
  extractLead,
  LEAD_MAX_WORDS,
  LEAD_MIN_WORDS,
  leadParagraphs,
  tidyExcerpt,
} from "../lib/article-text.mjs";

const words = (text) => text.split(/\s+/).filter(Boolean).length;
const sentence = (n, length = 12) => `Sentence ${n} ${"word ".repeat(length - 3).trim()} end.`;

test("keeps whole sentences until at least 150 words, without page furniture", () => {
  const text = [
    "Advertisement",
    "NEWYou can now listen to Fox News articles!",
    "Dubai hospital adopts remote patient monitoring",
    Array.from({ length: 6 }, (_, i) => sentence(i + 1)).join(" "),
    Array.from({ length: 10 }, (_, i) => sentence(i + 7)).join(" "),
    "This later paragraph must never appear in the stored opening text at all.",
  ].join("\n");
  const lead = extractLead(text, "Dubai hospital adopts remote patient monitoring");
  assert(words(lead) >= LEAD_MIN_WORDS && words(lead) <= LEAD_MAX_WORDS, `${words(lead)} words`);
  assert.equal(leadParagraphs(lead).length, 2);
  assert.match(lead, /^Sentence 1 /);
  assert.match(lead, /end\.$/);
  for (const excluded of ["Advertisement", "Fox News", "Dubai hospital adopts", "later paragraph"]) {
    assert(!lead.includes(excluded), excluded);
  }
});

test("splits one long block into sentences and keeps abbreviations together", () => {
  const block = `Baxter International Inc. (NYSE:BAX) announced a launch in Doha today. The U.S. State Department said nothing about it. ${Array.from({ length: 13 }, (_, i) => sentence(i + 1)).join(" ")} ${sentence(99)}`;
  const lead = extractLead(block);
  assert.match(lead, /^Baxter International Inc\. \(NYSE:BAX\) announced/);
  assert.match(lead, /The U\.S\. State Department said/);
  assert(words(lead) >= LEAD_MIN_WORDS && words(lead) <= LEAD_MAX_WORDS);
  assert(!lead.includes("Sentence 99"));
});

test("removes share-button text before the story but keeps a single real name", () => {
  const body = Array.from({ length: 10 }, (_, i) => sentence(i + 1)).join(" ");
  assert.match(extractLead(`Facebook Twitter LinkedIn Abu Dhabi, 27th October: ${body}`), /^Abu Dhabi, 27th October:/);
  assert.match(extractLead(`Share: Facebook | WhatsApp | Email ${body}`), /^Sentence 1 /);
  assert.match(extractLead(`Twitter launches a health feature in Dubai today. ${body}`), /^Twitter launches/);
});

test("a single very long sentence stops at the word limit with an ellipsis", () => {
  const lead = extractLead(`Opening ${"word ".repeat(300)}finish.`);
  assert.equal(words(lead), LEAD_MAX_WORDS);
  assert.match(lead, /…$/);
});

test("too little usable text produces no opening", () => {
  for (const text of [undefined, null, 42, "", "Short line.", `${sentence(1)} ${sentence(2)}`]) {
    assert.equal(extractLead(text), null);
  }
  assert(extractLead(Array.from({ length: 5 }, (_, i) => sentence(i, 12)).join(" ")));
});

test("cut-off excerpts end cleanly instead of mid-word", () => {
  assert.equal(
    tidyExcerpt("Baxter, a leader in patient monitoring, physical assessment and vision screening produc"),
    "Baxter, a leader in patient monitoring, physical assessment and vision screening…",
  );
  assert.equal(tidyExcerpt("Delegates travel to Riyadh to pitch to investors, judges, and leaders"), "Delegates travel to Riyadh to pitch to investors, judges, and…");
  assert.equal(tidyExcerpt("e-learning offerings across Uganda and ["), "e-learning offerings across Uganda and…");
  assert.equal(tidyExcerpt("Designed to translate cross-border ... Read more"), "Designed to translate…");
  assert.equal(tidyExcerpt("A complete sentence stays as it is."), "A complete sentence stays as it is.");
  assert.equal(tidyExcerpt("She said “it works.”"), "She said “it works.”");
  for (const empty of [null, undefined, "", "  ", "Read more"]) assert.equal(tidyExcerpt(empty), null);
});
