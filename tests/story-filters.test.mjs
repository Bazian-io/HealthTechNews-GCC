import assert from "node:assert/strict";
import test from "node:test";
import {
  findCountry,
  findTheme,
  matchesCountryFilter,
  matchesThemeFilter,
  mentionedCountries,
} from "../lib/story-filters.mjs";

const story = (title, extra = {}) => ({
  id: title, title, summary: null, source_description: null, country: null, category: null, ...extra,
});

test("finds countries mentioned by name, city, or nationality", () => {
  assert.deepEqual(mentionedCountries(story("Dubai hospital adopts AI")), ["United Arab Emirates"]);
  assert.deepEqual(mentionedCountries(story("Riyadh startup raises funding")), ["Saudi Arabia"]);
  assert.deepEqual(
    mentionedCountries(story("Qatari and Omani regulators meet", { source_description: "Talks in Manama." })),
    ["Qatar", "Bahrain", "Oman"],
  );
  assert.deepEqual(mentionedCountries(story("Clinic launches AI", { summary: "Expanding to Abu Dhabi." })), ["United Arab Emirates"]);
});

test("does not match country names hidden inside other words", () => {
  for (const title of ["Woman-led clinic adopts AI", "Romania expands telehealth", "Comanche County hospital opens"]) {
    const found = mentionedCountries(story(title));
    assert(!found.includes("Oman"), title);
  }
  assert.deepEqual(mentionedCountries(story("Global health AI report")), []);
});

test("country filter matches mentions and accepts older link values", () => {
  const dubai = story("Dubai hospital adopts AI");
  assert.equal(matchesCountryFilter(dubai, "United Arab Emirates"), true);
  assert.equal(matchesCountryFilter(dubai, "UAE"), true);
  assert.equal(matchesCountryFilter(dubai, "Qatar"), false);
  assert.equal(matchesCountryFilter(dubai, ""), true);
  assert.equal(findCountry("u.a.e.").label, "United Arab Emirates");
  // A stored country still counts, even without a mention in the text.
  assert.equal(matchesCountryFilter(story("Startup expands platform", { country: "Saudi Arabia" }), "Saudi"), true);
  assert.equal(matchesCountryFilter(dubai, "Atlantis"), false);
});

test("theme filter uses the trend themes and honours older category links", () => {
  const ai = story("Hospital adopts artificial intelligence for diagnosis");
  assert.equal(matchesThemeFilter(ai, "clinical-ai"), true);
  assert.equal(matchesThemeFilter(ai, "Clinical AI and automation"), true);
  assert.equal(matchesThemeFilter(ai, "funding"), false);
  assert.equal(matchesThemeFilter(ai, ""), true);
  assert.equal(findTheme("FUNDING").id, "funding");
  assert.equal(matchesThemeFilter(story("Old item", { category: "Digital Health" }), "Digital Health"), true);
  assert.equal(matchesThemeFilter(ai, "Digital Health"), false);
});
