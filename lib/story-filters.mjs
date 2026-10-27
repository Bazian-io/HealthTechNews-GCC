import { getArticleTopicId, TREND_THEMES } from "./trending-news.mjs";

// News stream filters derived from story text at display time. A country
// filter means "mentions this country", not a verified story location, and
// nothing here is stored. Place names mirror the collector's GCC keyword filter.
export const GCC_COUNTRY_MENTIONS = [
  {
    label: "Saudi Arabia",
    aliases: ["Saudi Arabia", "Saudi", "KSA"],
    pattern: /\b(?:Saudi(?: Arabia)?|KSA|Riyadh|Jeddah|Dammam|Makkah|Mecca|Madinah|Medina|NEOM)\b/i,
  },
  {
    label: "United Arab Emirates",
    aliases: ["United Arab Emirates", "UAE", "U.A.E."],
    pattern: /\b(?:UAE|U\.A\.E\.?|United Arab Emirates|Emirates|Emirati|Dubai|Abu Dhabi|Sharjah|Ajman|Ras Al Khaimah|Fujairah)\b/i,
  },
  { label: "Qatar", aliases: ["Qatar"], pattern: /\b(?:Qatar|Qatari|Doha)\b/i },
  { label: "Kuwait", aliases: ["Kuwait"], pattern: /\b(?:Kuwait|Kuwaiti)\b/i },
  { label: "Bahrain", aliases: ["Bahrain"], pattern: /\b(?:Bahrain|Bahraini|Manama)\b/i },
  { label: "Oman", aliases: ["Oman"], pattern: /\b(?:Oman|Omani|Muscat)\b/i },
];

function normalize(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase().replaceAll(".", "") : "";
}

function storyText(article) {
  return [article?.title, article?.summary, article?.source_description]
    .filter((value) => typeof value === "string")
    .join(" ");
}

// Accepts a label or alias, so older links such as ?country=UAE keep working.
export function findCountry(value) {
  const wanted = normalize(value);
  if (!wanted) return null;
  return GCC_COUNTRY_MENTIONS.find((country) =>
    country.aliases.some((alias) => normalize(alias) === wanted),
  ) ?? null;
}

// Every GCC country the headline or excerpts mention; a story can mention several.
export function mentionedCountries(article) {
  const text = storyText(article);
  return GCC_COUNTRY_MENTIONS
    .filter((country) => country.pattern.test(text))
    .map((country) => country.label);
}

export function matchesCountryFilter(article, value) {
  if (!normalize(value)) return true;
  const country = findCountry(value);
  // A stored country, where one exists, still counts.
  const stored = findCountry(article?.country)?.label ?? normalize(article?.country);
  if (!country) return Boolean(stored) && stored === normalize(value);
  return stored === country.label || mentionedCountries(article).includes(country.label);
}

// Themes are the same rule-based themes used by trends and the theme landscape.
export function findTheme(value) {
  const wanted = normalize(value);
  if (!wanted) return null;
  return TREND_THEMES.find(
    (theme) => normalize(theme.id) === wanted || normalize(theme.label) === wanted,
  ) ?? null;
}

export function matchesThemeFilter(article, value) {
  if (!normalize(value)) return true;
  const theme = findTheme(value);
  // Older links used a stored category name; keep honouring an exact match.
  if (!theme) return normalize(article?.category) === normalize(value);
  return getArticleTopicId(article) === theme.id;
}
