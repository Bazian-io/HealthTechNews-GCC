# GCC HealthTech News

An automated GCC HealthTech news collector in development, with a Next.js website
for reading published articles. The main product value is the collection and
processing pipeline.

GCC covers Saudi Arabia, the United Arab Emirates, Bahrain, Kuwait, Oman, and Qatar.
The goal is to have fresh, relevant news ready on the website each morning.

## Current milestone

**As of 26 October 2026:** FreeNewsAPI.ai is the primary news source for this
initial version. Its collector automatically publishes new articles that pass a
basic GCC HealthTech keyword filter, as explicitly requested. RSS and GDELT remain
available and save drafts only. The public website now uses an editorial briefing
homepage with shareable search and filter URLs, plus a news stream that reveals
articles in groups of ten. It remembers the previous visit in the reader's browser,
reports newly added stories, marks them as new, and groups the stream into Today,
Yesterday, and Earlier. Article pages connect country and topic labels back to
filtered browsing and show additional published coverage. The public header offers
light, dark, and system themes, plus a browser-local saved-stories reading list,
with product-specific browser and social sharing artwork. The homepage now opens
with an evidence-backed analysis of trends from the latest seven days. These reader UI
changes remain local until their production deployment completes.

| Working now | Still to build |
| --- | --- |
| Editorial homepage, weekly trend analysis, daily freshness briefing, searchable news stream, saved stories, and article discovery links | Validate relevance accuracy and store verdicts |
| Product favicon, social preview, metadata, and theme control | Summarization and classification |
| Database error messages and article-not-found page | Review/publication workflow |
| Unique slugs; published articles must have a nonblank slug | Persistent collection run history and alerting |
| FreeNewsAPI.ai collection and publication; RSS/GDELT drafts; duplicate URL and same-headline checks | Similar-headline (fuzzy) story matching |
| Collector tests, dry-run preview, and run counts | Review GDELT search quality against real results |
| Optional read-only Claude relevance checker and labelled examples | — |

The website has been deployed on Vercel. FreeNewsAPI.ai can still be run from a
terminal, and a protected Vercel Cron route schedules it once a day. The user
confirmed on 22 October 2026 that the production cron is active and working.

### Intended flow

```text
News sources → collect → remove duplicates → check GCC HealthTech relevance
             → summarize/classify → publish in Supabase → website
```

For now, **FreeNewsAPI.ai skips editorial review and publishes automatically**.
Its keyword filter is approximate, not a human or AI relevance verdict. The
review/processing stages above remain future work. RSS/GDELT still stop at drafts,
which do not appear on the public website.

## Run locally

Use **Node.js 22 or newer**. From this existing project folder:

1. Install the locked dependencies with `npm ci`.
2. Configure the variables listed below, using [.env.example](.env.example) as a
   reference. Keep existing environment files if they are already configured.
3. Run `npm run dev`, then open `http://localhost:3000`.

### Environment variables

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL; used by website and collector |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Website database reads and authentication |
| `SUPABASE_SECRET_KEY` | Backend secret key for collector inserts; server use only |
| `CRON_SECRET` | Backend-only bearer secret protecting the Vercel Cron endpoint |
| `ANTHROPIC_API_KEY` | Claude API key for the relevance check; server use only |

Keep the backend secret in the Git-ignored `.env.local`. The collector expects a
Supabase backend secret key, not a publishable key. Never prefix this secret with
`NEXT_PUBLIC_`, expose it to browser code, or commit its value.

For database writes, the collectors load `.env.local` before `.env`; existing
shell variables take priority. A dry run needs no database credentials. GDELT's
dry run also skips reading environment files entirely. GDELT discovery requires
no API token, new dependency, or AI call. FreeNewsAPI.ai likewise needs no account,
API key, or paid service; its dry run does not load credentials either.
`ANTHROPIC_API_KEY` is only used by the
separate, optional relevance command. Vercel supplies
`VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` for website metadata.

### Database setup

Migration files live in [supabase/migrations](supabase/migrations). The eleven
migrations listed below have been applied to the remote project.
For a new checkout, verify the linked project's migration history before applying
anything; do not reset or reseed the existing remote database.

For an already linked project, inspect history with:

```sh
npx supabase migration list --linked
```

## Collect FreeNewsAPI.ai articles and see them on the website

```sh
# Preview all six GCC countries without database access
npm run collect:free-news -- --dry-run

# Collect and immediately publish new matching articles
npm run collect:free-news

# Start the local website, then open http://localhost:3000
npm run dev
```

For a smaller run, add `--country uae --days 7` to either collection command.
Countries: `saudi-arabia`, `uae`, `qatar`, `kuwait`, `bahrain`, `oman`.
`--days` accepts 1–30 and defaults to 30, matching the API's recent archive.

The website reads published articles from Supabase. Refresh the homepage after
collection; new rows appear first, with the publisher, source excerpt when
available, and original source link. No login or review screen is required for
readers. Publication happens through the terminal collector or the daily Vercel
Cron described below; it never runs during a reader's page view.

**The command writes to the configured Supabase project.** If your local app and
live website share that project, newly published articles appear on both, even
without deploying code. The updated excerpt display is local until deployed.

### What it collects

- Uses [FreeNewsAPI.ai's JSON search API](https://freenewsapi.ai/docs/search):
  three searches per country (digital health, telemedicine, medical AI), with up
  to ten results each. This is a bounded sample, not comprehensive coverage.
- Uses country words in the search text, not the API's publisher-country filter.
  A basic title/description filter requires GCC geography and HealthTech wording.
  It can miss relevant stories or admit false positives; no paid AI is invoked.
- Saves new matches with `status = 'published'`, stable slugs, canonical URLs,
  publisher hostname, source description, and collection timestamp.
- Saves the API's `image` field in `image_url` only when it is a public `https://`
  address; other values stay NULL. The image is never downloaded or rehosted:
  readers' browsers load it from the publisher, without sending a referrer, next
  to the publisher credit and original-source link. See "Article images" below
  for how the website displays them.
- Leaves `country`, `category`, and editorial `summary` NULL. Source descriptions
  remain separate and are labelled “Publisher excerpt” in the UI. Dates are kept
  only with `date_source = jsonld` or `meta` and a valid, non-future timestamp;
  missing provenance and crawl-time fallbacks stay NULL.
- Reuses the existing duplicate-safe insert. Existing rows, including drafts
  from RSS/GDELT, are never overwritten or automatically promoted.
- Skips copies of a story it has already published: AMP addresses are stored as
  the regular page, and a new result is skipped when its headline matches a
  story published in the last 14 days or earlier in the same run. See "One card
  per story" below for the matching rules.
- Requests article text (`full_text=true`) only to quote its opening: the first
  complete sentences, about 150–200 words, are saved in `source_lead`, and the
  rest of the text is discarded. Share-button text and short page-furniture lines
  are skipped; openings under 50 usable words stay NULL. It does not visit
  publisher pages, execute instructions in responses, or call an AI service.
  Original publisher attribution and links are retained. See the
  [provider's terms](https://freenewsapi.ai/legal/terms): article text belongs to
  publishers and no licence is granted, so the quoted opening is a deliberate,
  attributed product choice (made 27 October 2026), not a licensed reuse.

Requests are sequential with a one-second gap, 15-second timeout, and 2 MiB
response limit. Network failures, HTTP 429, and HTTP 5xx get at most one retry,
waiting at least two seconds and honoring `Retry-After`. A requested cooldown
above 30 seconds or repeated 429 stops remaining searches. Valid empty lists
succeed; malformed responses are failures. Successful results can still be
published during a partially failed run, which exits with code 1.

The command prints a starting message and a final JSON report. `found` counts
raw returned rows, `filtered` counts rejected keyword matches, `invalid` counts
unusable rows, and `saved` counts new published articles. `duplicates` includes
overlapping search results, existing database URLs, and same-story copies;
`sameStory` counts the headline matches alone. `searches` reports API
failures separately from database save failures. Dry runs save nothing and show
up to ten previews, but cannot identify duplicates already in Supabase. If the
recent-headline read fails, the run still publishes and reports that copies were
not filtered against the database.

No new database migration or dependency is required. The existing collection
metadata and backend INSERT/SELECT grants are sufficient.

### Daily Vercel Cron

[`vercel.json`](vercel.json) calls `/api/cron/collect-free-news` every day at
05:00 UTC. That is 08:00 in Saudi Arabia, Qatar, Kuwait, and Bahrain, and 09:00 in
the UAE and Oman. Vercel schedules cron jobs only on production deployments. On
the Hobby plan, the invocation can occur at any point during the scheduled hour.

Before deploying, add these server-side environment variables to the Vercel
project's Production environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `CRON_SECRET`, using a random value of at least 16 characters

Vercel automatically sends `CRON_SECRET` as a bearer token. The route rejects
missing or incorrect tokens, bypasses the website login redirect, and allows up
to five minutes for the collector's 18 paced searches. It returns an error status
when a search or database save fails so the failure is visible in Vercel logs.
Vercel does not automatically retry failed cron invocations.

Repeated or occasionally duplicated cron invocations are safe for stored rows:
the existing unique URL insert skips duplicates without overwriting articles.

### Reader freshness

The homepage uses each article's database `created_at` timestamp to group the news
stream into Today, Yesterday, and Earlier. On a returning visit, it counts articles
added since the previous visit and marks those stories with a `New` badge across
Top stories and the news stream. Day boundaries use Riyadh time for one consistent
GCC briefing day.

The previous-visit timestamp is stored only in that browser's local storage. A
first-time visitor sees an explanation instead of an artificial new-story count,
and the feature safely falls back when browser storage is unavailable. Source
publication dates remain separate and are not inferred from collection time.

### Saved stories

Readers can save articles from Top stories, the news stream, article pages, and
related coverage. The header shows the current count and links to `/saved`, where
the reading list is ordered by when each story was saved and includes individual
remove controls.

The list stores a validated article snapshot in that browser's local storage and
is capped at 100 stories. It does not require an account, query a private API, or
write to Supabase. It syncs between open tabs, but not between devices or browsers;
clearing browser data also clears the list.

### Reader appearance

The reader uses a cool slate canvas with white and faint warm feature surfaces in
light mode. Dark mode combines soft-white text, layered slate surfaces, distinct
control and nested-panel tones, and very faint teal/burgundy background atmosphere. Teal
remains the primary accent; muted burgundy highlights selected editorial labels
and evidence details. Neutral borders, subtle shadows, and consistent section
spacing carry across the homepage, article pages, and saved stories. The original Geist and
Newsreader fonts, content, section order, and reader functionality are preserved.
Summaries and excerpts use a readable 16px treatment, while the featured story
uses a faint warm surface and burgundy top rule to distinguish it from secondary
coverage. Daily chart bars have faint guide lines, and controls retain visible
keyboard focus indicators. The sticky header uses a subtly elevated surface and
clearer navigation states. Weekly chart labels cover the full seven-day window,
with burgundy identifying the busiest day and teal showing the remaining activity.
Pages use an 80rem (`max-w-7xl`) layout with wider side padding on large screens;
the trend chart takes half its row and is taller there. Article pages use a 56rem (`max-w-4xl`)
story column for the headline, image, and text, and saved stories use a 64rem list.

### Article pages

- **Opening text:** when `source_lead` exists, the page shows it under "From
  [publisher]" as a quotation, followed by a note that it is the opening of the
  original article and that the story continues on the publisher's website.
  Otherwise it shows the publisher excerpt as before. Articles collected before
  27 October 2026 have no opening text.
- **Cleaner excerpts:** many publisher descriptions are cut at a fixed length,
  often mid-word. Excerpts that do not end with sentence punctuation drop the
  last, possibly partial, word and end with "…"; a trailing "Read more" is removed.
  This applies at display time on every page, so stored text is unchanged.
- **Story context:** "Added to briefing" shows when the story arrived. If the
  story falls in one of this week's trends (same rule-based theme, within the
  seven-day window), a panel names the trend with its story and publisher counts
  and links to the homepage analysis. Themes are not shown as labels elsewhere.
- **Continue exploring** ranks stories on the same rule-based theme first, then
  matching topic or country fields, then the latest coverage.

### One card per story

Publishers often republish the same press release, and some pages also exist as
an AMP mobile copy. [lib/story-fingerprint.mjs](lib/story-fingerprint.mjs) gives
each headline a fingerprint: lowercase words without punctuation or accents, with
a trailing publisher name such as " - The Tribune" removed only when it matches
that publisher's address. Headlines with fewer than four words never match.

- The FreeNewsAPI.ai collector uses the fingerprint to skip new copies (see above).
- The website groups stored copies with the same fingerprint, so Top stories, the
  news stream, trends, new-story counts, and Continue exploring show each story
  once. The card uses the earliest copy with an image, preferring a regular page
  over AMP, and lists the other publishers as "Also reported by".
- Matching is exact. Differently worded headlines about the same event, such as
  "launches" versus "unveils", stay separate to avoid merging distinct stories.
- Grouping is display-only: stored rows are not changed, unpublished, or deleted.

### Article images

Publisher images appear in Top stories, the news stream, article pages, Continue
exploring, trend evidence, and saved stories. They load directly from the publisher
with a short shimmer and fade-in; nothing is downloaded, rehosted, or optimized.

- Top stories keep newest-first order, but the Featured slot uses the newest of the
  latest four stories that has an image. The other three appear alongside it.
- Card layouts (Featured, Top stories, Continue exploring) show a branded teal
  placeholder with the publisher's initial when no usable image exists. List layouts
  (news stream, trend evidence, saved stories, article page) stay text-only instead.
- Images narrower than 300 pixels, usually publisher logos, and images that fail to
  load are treated as missing.
- Saved stories remember the image address from the time of saving. Stories saved
  before this feature, and articles collected before 26 October 2026, have none.

### Theme landscape

Below "Trending this week", a bubble chart shows the same rule-based themes over a
selectable period: this week, the last 4 weeks, or the last 8 weeks. Bubble size
and horizontal position show how many stories a theme has; height shows the change
against the equally long period before it. Each theme keeps one colour in light and
dark mode, and bubbles glide to new positions when the period changes (instantly for
readers who prefer reduced motion). Hovering, tapping, or tabbing to a bubble shows
its story and publisher counts, the change, and its two latest headlines.
Teal "↑ Gaining" and burgundy "↓ Fading" tags mark the halves, a burgundy dashed
"Steady" line divides them over faint teal and burgundy zones, and a "Fewer stories →
More stories" axis runs along the bottom. Limited-data bubbles use a dashed outline
while their names stay fully readable.

- Momentum is only shown when stories exist from before the comparison period;
  otherwise bubbles sit on one line and the chart says momentum needs earlier data.
- Themes with fewer than two stories are faded and marked as limited data. When
  fewer than three themes have stories, the panel says so instead of drawing a map.
- Counts come from stories in this briefing after same-story copies are grouped.
  They are not stored and are not claims about coverage elsewhere.

### Trending this week

The homepage groups published articles added in the past seven days into transparent
HealthTech themes using their headlines and stored summary or publisher excerpt.
It ranks qualifying themes by distinct publisher breadth, story count, and recent momentum.
A trend requires at least two related stories from two named publishers, so one
publisher repeating a subject cannot create a trend by itself.

The leading trend shows seven daily graph periods labelled as related stories by day,
a plain-language explanation,
story and publisher counts, and the exact published articles used as evidence. Up
to two other trends appear under “Also trending”; selecting one promotes it to the
main position and updates the evidence. Momentum describes when stories were added
to this briefing, not overall GCC market activity or popularity across the web.

This is free, deterministic analysis performed from existing page data. It does
not call AI, write classifications to Supabase, or infer missing countries. When
the seven-day window lacks enough multi-publisher evidence, the section says so and
shows the latest developments instead of inventing a trend.

## Run the RSS collector

The source is the **Saudi Ministry of Health English RSS feed**. The exact feed URL
is defined by `FEED_URL` in [lib/news-collector.mjs](lib/news-collector.mjs).
It includes general healthcare announcements, so some collected items will not be
HealthTech news.

```sh
# Preview the feed without reading or writing Supabase
npm run collect:news -- --dry-run

# Save new articles as drafts
npm run collect:news

# Run again to verify that existing URLs are skipped
npm run collect:news
```

The output reports found, saved, duplicate, invalid, and failed items. Dry runs
also report previewed items and show up to three examples. A dry run detects
repeated URLs within the feed, but cannot tell which URLs are already in Supabase.

### What a real run does

1. Fetch the feed with timeouts and size limits (2 MiB and at most 100 entries).
2. Read each headline, source URL, date, and publisher description.
3. Normalize Ministry of Health URLs and remove fragments and known tracking
   parameters. Skip entries with missing titles or unsupported URLs.
4. Generate a slug from the title plus a short hash of the URL.
5. Insert new articles with `status = 'draft'`. The unique `original_url` rule
   ignores existing URLs, including overlapping runs, without changing saved articles.
6. Print the result. Feed failures or database save failures produce a nonzero
   exit code so a future scheduler can detect failure.

Drafts can be inspected in Supabase's Table Editor. Repeat collection never
replaces existing summaries, slugs, or publication status. The collector currently
reads only the feed, not full article pages or a historical archive. It has no
persistent run history or automatic retries. Different URLs covering the same
story are not yet detected as duplicates.

## Run the GDELT collector

[lib/gdelt-collector.mjs](lib/gdelt-collector.mjs) uses the public
[GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
with `mode=artlist&format=json`. It discovers candidates for review, not articles
that have already passed a relevance check. The RSS command remains available.

```sh
# Preview all six GCC countries; never reads/writes Supabase or loads credentials
npm run collect:gdelt -- --dry-run

# Smaller preview: Saudi Arabia over the last seven days
npm run collect:gdelt -- --dry-run --country saudi-arabia --days 7

# Save discovered candidates as drafts (requires the existing backend credentials)
npm run collect:gdelt -- --country saudi-arabia --days 7
```

`--country` accepts `saudi-arabia`, `uae`, `qatar`, `kuwait`, `bahrain`, or `oman`.
Omit it to search all six. `--days` accepts 1–90, defaulting to 7.
Use `npm run collect:gdelt -- --help` for the options.

Each country has two searches: technology terms and related healthcare sector
developments. Searches combine country names and city/nationality aliases with
HealthTech terms. The sector search uses GDELT's `near8` operator to keep words
such as healthcare and investment close together; broad independent keyword
groups matched unrelated news roundups during the initial live test. All query
strings are kept below 250 characters. They do not use publisher location to
assign an article's country. English search terms also find GDELT's translated coverage in supported
languages; stored headlines keep their original language.

The default run makes 12 searches, returning at most 75 results per search.
Reaching that cap produces a warning because additional results may exist; this
is not a complete archive or an exhaustive count. Try a shorter `--days` window
when a query is capped. There is no automatic pagination or historical backfill.

### Stored data and duplicate handling

- Save the headline, normalized original URL, stable slug, publisher hostname in
  `source_name`, and our collection time in `collected_at`, with `status = 'draft'`.
- Leave `summary`, `source_description`, `country`, `category`, and `published_at`
  NULL. DOC article-list metadata is insufficient for those fields. In particular,
  GDELT's `seendate` is not treated as a verified publisher publication date.
- Fetch only GDELT search results; do not download full publisher articles or images.
- Reuse URL normalization and duplicate-safe insertion with RSS. The original RSS
  collector still restricts links to Ministry of Health. GDELT accepts public
  publisher domains and preserves their protocol, hostname, content parameters,
  and path case. Both use the same canonical URL for Ministry of Health articles.
- Skip repeated URLs across searches, sources, and runs without changing stored
  rows. Different publishers' URLs for the same story remain separate candidates.

No new database migration is needed; the existing collection metadata migrations
are still required. No website or authentication changes are involved, and draft
rows remain hidden from public readers. GDELT search quality needs human review.

### Limits, failures, and future scheduling

Requests run sequentially with at least 30 seconds between requests in one run.
Each request has a 20-second timeout and a 2 MiB response limit. A temporary network
failure, HTTP 5xx, or HTTP 429 gets at most one retry, waiting at least 60 seconds
and respecting `Retry-After` when present. A requested wait above 60 seconds stops
the run so a later execution can retry. Persistent 429 responses also stop later
searches rather than repeatedly contacting a rate-limited service.

The first request starts immediately. A one-country run has two searches; without
retries, it includes one 30-second pause. All six countries include at least
5 minutes 30 seconds of pauses, plus request time. The CLI prints its JSON report
only when finished, so pauses are silent. `--days 1` reduces the lookback window,
not the number of searches or their pacing. Slower pacing does not guarantee API
availability.

The JSON report separates successful, failed, skipped, and capped searches from
article counts. `found` counts returned rows from successful searches before URL
deduplication; it is not a count of relevant stories. `failed` counts database
save failures; `searches.failed` counts failed searches. Dry runs show up to ten
unique candidate previews, and cannot detect duplicates already stored in Supabase.

Malformed responses are reported as failures, not empty searches. Valid empty
article lists succeed with zero results. A partially failed real run may still
save candidates from successful searches as drafts. Exit code 1 means a search
failed/was skipped or a database save failed; exit code 0 can still contain
warnings about result caps or invalid articles.

Run only one GDELT collector at a time when scheduling later: pacing is local to
one process, not a global lock. A full run can take several minutes. Repeat runs
are safe for stored articles, but API availability and completeness are not
guaranteed. There is no scheduler or persistent run history yet.

## Review collected drafts

Drafts are hidden from the website by row-level security, so listing them uses the
collector's backend key. This command only reads.

```sh
# Readable listing, newest first
npm run drafts:list

# Full rows, for building a labelled set
npm run drafts:list -- --json
```

### GCC HealthTech relevance labels

[tests/fixtures/relevance-gold.json](tests/fixtures/relevance-gold.json) holds a
hand-checked verdict for each collected draft: `relevant`, `not_relevant`, or
`borderline`. It exists so that a future relevance check can be measured against
real articles from the live feed rather than invented examples.

On the 20 drafts collected on 16 September 2026 the reviewed result is **6
relevant and 14 not relevant**, with no borderline cases left. The file's
`rubricNotes` records what the site includes and excludes, and the one line that
is still undecided.

The site's subject is the GCC HealthTech **sector**, not only its products. An
article earns a place if it tells a sector reader something they can act on or
learn direction from. That admits three kinds of item: deployed health
technology, GCC sector events the reader could attend, and substantial
infrastructure, investment, or research partnerships. It excludes ministerial
diplomacy, statements of gratitude, awareness campaigns, and awards.

The deciding test for any agreement is whether concrete subject matter is named.
"Signs MoU on Research and Clinical Innovation" names a subject and is included;
"Signs MoU to Strengthen Partnership" names nothing and is excluded. When an
article is too vague to tell, it is excluded.

## Check draft relevance

[lib/relevance.mjs](lib/relevance.mjs) applies that rubric to a draft. `RUBRIC` in
that file is what the check actually enforces; the prose above mirrors it.

```sh
# Assess every draft and print the verdicts
npm run check:relevance

# Also score the result against the labelled set
npm run check:relevance -- --gold
```

This needs `ANTHROPIC_API_KEY`. **It never writes to the database.** A relevance
verdict is not a decision to publish; storing verdicts waits on its own migration.

Each draft is judged in two stages. A narrow deterministic rule excludes
gratitude-to-leadership headlines that mention no technology, and everything else
goes to Claude, which must answer through a strict tool schema. The response is
rejected rather than assumed relevant if no verdict comes back. `--gold` prints
agreement, precision, and recall against the labelled verdicts, skipping any
entry still marked `borderline`.

**Not yet measured against the live API.** The offline tests cover the rule, the
request shape, and the failure paths, but no accuracy figure has been recorded.

## Database and article fields

The application has one table: **`public.articles`**.

| Fields | Meaning |
| --- | --- |
| `id`, `title`, `original_url` | Article identity, headline, and unique source URL |
| `slug`, `status` | Website URL segment and publication state; status defaults to `draft` |
| `source_name`, `source_description` | Publisher name/hostname and its description, when supplied |
| `image_url` | Publisher-hosted lead image address (FreeNewsAPI.ai only), when supplied |
| `source_lead` | Quoted opening of the publisher article, about 150–200 words (FreeNewsAPI.ai only) |
| `summary`, `country`, `category` | Editorial/processing fields; collector leaves these empty |
| `published_at` | Source publication date, when valid |
| `collected_at` | When the collector first saved the article |
| `created_at`, `updated_at` | Database timestamps, initially set on insert |

Missing source descriptions and missing or invalid source dates remain NULL
(empty). `source_description` is publisher text, not an AI summary. Do not infer
an article's country solely from the publisher's location. `updated_at` currently
has no automatic update trigger.

Row-level security (RLS) limits public and signed-in website readers to
`status = 'published'`. They have no article write policy. The collector uses a
separate backend client; its migration grants `service_role` SELECT and INSERT.
A backend key bypassing RLS still needs these table permissions.

`original_url` and `slug` each have a unique constraint. Published articles must
have a slug containing at least one non-whitespace character. Drafts may have no
slug, although the collector generates one. Status is currently a text field,
not a fixed list enforced by a database constraint.

### Migration history

| Migration | Purpose |
| --- | --- |
| `20260905085217_create_articles_table.sql` | Create articles and enable RLS |
| `20260907104028_articles_public_select_policy.sql` | Allow readers to see published articles |
| `20260907104041_seed_test_article.sql` | Add one fictional published test article |
| `20260907104127_articles_grant_select.sql` | Grant website roles SELECT access |
| `20260907111103_articles_add_slug.sql` | Add nullable, unique slugs |
| `20260907111104_set_test_article_slug.sql` | Give the test article its URL slug |
| `20260915181933_articles_require_published_slug.sql` | Reject published articles with null or blank slugs |
| `20260916173923_articles_add_collection_metadata.sql` | Add publisher and collection metadata |
| `20260916174609_articles_grant_collector_access.sql` | Grant backend collector SELECT/INSERT access |
| `20261026120000_articles_add_image_url.sql` | Add nullable, HTTPS-only publisher `image_url` (applied remotely 26 October 2026) |
| `20261027120000_articles_add_source_lead.sql` | Add nullable `source_lead`, the quoted article opening, max 2,000 characters (applied remotely 27 October 2026) |

Add a new migration for future schema changes; preserve already applied files.
If collector saves fail with code `42501`, check the collector grant migration
and the configured backend key.

## Code map and routes

| Location | Responsibility |
| --- | --- |
| [app/page.tsx](app/page.tsx) | `/`: published articles ordered by insertion time, newest first, with attributed source excerpts |
| [components/article-browser.tsx](components/article-browser.tsx) | Searchable, filtered, paginated, and day-grouped homepage news stream |
| [components/article-image.tsx](components/article-image.tsx) | Publisher-hosted article image with loading shimmer, branded/hidden fallbacks, and small-image filtering |
| [lib/story-fingerprint.mjs](lib/story-fingerprint.mjs) | Tested headline fingerprints and display grouping of same-story copies |
| [components/also-reported.tsx](components/also-reported.tsx) | "Also reported by" credit for grouped copies |
| [lib/article-text.mjs](lib/article-text.mjs) | Tested opening-text extraction and cut-off excerpt cleanup |
| [lib/article-images.mjs](lib/article-images.mjs) | Tested image URL checks, featured-story choice, minimum width, and placeholder initial |
| [components/briefing-freshness.tsx](components/briefing-freshness.tsx) | Browser-local visit tracking, freshness banner, and new-story badges |
| [components/trending-news.tsx](components/trending-news.tsx) | Interactive main trend, momentum graph, secondary trends, evidence, and low-activity state |
| [components/theme-landscape.tsx](components/theme-landscape.tsx) | Interactive theme bubble chart with period switch and detail card |
| [lib/theme-landscape.mjs](lib/theme-landscape.mjs) | Tested per-period theme counts, honest comparisons, and label-aware bubble layout |
| [app/saved/page.tsx](app/saved/page.tsx) | `/saved`: browser-local reading list and empty state |
| [components/saved-stories.tsx](components/saved-stories.tsx) | Saved-story provider, controls, header count, and reading-list UI |
| [app/news/[slug]/page.tsx](app/news/[slug]/page.tsx) | `/news/[slug]`: published article details and original source link |
| [app/news/[slug]/not-found.tsx](app/news/[slug]/not-found.tsx) | Missing/unpublished article page |
| [lib/supabase](lib/supabase) | Website server/browser clients and login-cookie maintenance |
| [proxy.ts](proxy.ts) | Entry point for session handling and protected routes |
| [lib/news-collector.mjs](lib/news-collector.mjs) | Feed parsing, normalization, draft creation, backend inserts |
| [lib/collector-utils.mjs](lib/collector-utils.mjs) | Shared URL cleanup, draft/slug creation, backend client, duplicate-safe inserts |
| [lib/gdelt-collector.mjs](lib/gdelt-collector.mjs) | GCC queries, bounded JSON requests/retries, GDELT draft mapping |
| [lib/free-news-collector.mjs](lib/free-news-collector.mjs) | FreeNewsAPI.ai queries, basic keyword filter, bounded requests, published article mapping |
| [lib/free-news-cron.mjs](lib/free-news-cron.mjs) | Cron authorization, collector invocation, and safe HTTP result handling |
| [lib/article-freshness.mjs](lib/article-freshness.mjs) | Tested timestamp comparison, GCC day grouping, and safe visit persistence |
| [lib/saved-stories.mjs](lib/saved-stories.mjs) | Saved-story validation, limits, toggling, and safe browser persistence |
| [lib/trending-news.mjs](lib/trending-news.mjs) | Tested seven-day topic grouping, multi-publisher threshold, ranking, and momentum analysis |
| [app/api/cron/collect-free-news/route.ts](app/api/cron/collect-free-news/route.ts) | Protected Vercel Cron route for daily FreeNewsAPI.ai collection |
| [scripts/collect-free-news.mjs](scripts/collect-free-news.mjs) | FreeNewsAPI.ai collection/publication command and credential-free dry run |
| [scripts/collect-news.mjs](scripts/collect-news.mjs) | Terminal command, environment loading, result output |
| [scripts/collect-gdelt.mjs](scripts/collect-gdelt.mjs) | GDELT terminal command, country/lookback options, credential-free dry run |
| [scripts/list-drafts.mjs](scripts/list-drafts.mjs) | Read-only listing of collected drafts for relevance review |
| [lib/relevance.mjs](lib/relevance.mjs) | The written rubric, the exclusion rule, and the Claude verdict call |
| [scripts/check-relevance.mjs](scripts/check-relevance.mjs) | Terminal command; scores drafts and compares them to the labelled set |
| [tests/news-collector.test.mjs](tests/news-collector.test.mjs) | Collector tests using example feeds and a simulated database |
| [tests/gdelt-collector.test.mjs](tests/gdelt-collector.test.mjs) | Offline GDELT, shared processing, and command tests using synthetic responses |
| [tests/free-news-collector.test.mjs](tests/free-news-collector.test.mjs) | Offline FreeNewsAPI.ai, publication, duplicate, metadata, failure, and CLI tests |
| [tests/free-news-cron.test.mjs](tests/free-news-cron.test.mjs) | Offline cron authentication, execution, and error-response tests |
| [tests/article-freshness.test.mjs](tests/article-freshness.test.mjs) | Offline day grouping, new-story counting, and browser-storage fallback tests |
| [tests/saved-stories.test.mjs](tests/saved-stories.test.mjs) | Offline saved-story validation, limits, toggling, and storage fallback tests |
| [tests/trending-news.test.mjs](tests/trending-news.test.mjs) | Offline trend grouping, evidence threshold, ranking, momentum, and failure-boundary tests |
| [tests/relevance.test.mjs](tests/relevance.test.mjs) | Relevance tests using a simulated Claude client; no network access |
| [tests/fixtures/relevance-gold.json](tests/fixtures/relevance-gold.json) | Hand-checked relevance verdicts for the collected drafts |

The website's server client uses cookies and the publishable key. The collector's
backend client uses the secret key with no browser session. Both query the same
`articles` table. Website pages distinguish database query failures from empty
results; the detail page returns not-found only after a successful empty query.
Article pages show stored metadata and editorial summaries or labelled publisher
excerpts, not full publisher article bodies.

Starter authentication routes remain under `/auth`: `login`, `sign-up`,
`sign-up-success`, `forgot-password`, `update-password`, `error`, and the `confirm`
callback. `/protected` is a starter tutorial page, not an article editor.
There is no admin dashboard yet.

### Security baseline

- [next.config.ts](next.config.ts) sends browser security headers on every route:
  framing is blocked (`frame-ancestors 'none'` and `X-Frame-Options: DENY`),
  content-type guessing is disabled, cross-site referrers carry only the origin,
  and camera, microphone, geolocation, and ad-topic APIs are disabled. Vercel adds
  HSTS. A full Content Security Policy is not set yet.
- The temporary public `/api/test-supabase` diagnostic was removed on 27 October
  2026, along with its login-redirect exception.
- Account settings outside this repository, such as disabling Supabase public
  sign-ups and enabling GitHub Dependabot alerts and secret scanning, are managed
  in those dashboards and are not recorded here as done.

## Checks and recorded verification

```sh
npm run test:collector
npm run test:gdelt
npm run test:free-news
npm run test:relevance
npm run test:ui
npm run lint
npx tsc --noEmit
```

The collector tests run without network or database access. Use `npm run build`
for a production build and `npm run start` to serve that build.

**Recorded local verification on 27 October 2026 (theme landscape, `main` working
tree):**

- Added the theme landscape bubble chart. All 130 offline tests passed, including
  new period, comparison, limited-data, layout, and label-spacing tests; lint,
  TypeScript for project files, `git diff --check`, and the production build passed.
- Local screenshots covered dark and light desktop and 390px mobile, the "This week"
  and "Last 4 weeks" periods, and the "not compared" state. A first version had
  overlapping labels on small bubbles; labels now sit below small bubbles with
  reserved space. No horizontal overflow, database write, commit, or deployment.

**Recorded local verification on 27 October 2026 (fuller article pages,
`Improve_UI` branch):**

- Added the `source_lead` migration and applied it to the linked Supabase project;
  it was the only pending migration. A publishable-key read of the new column
  succeeded: 50 published rows, none with opening text yet.
- A live FreeNewsAPI.ai sample of six articles produced openings of 100–129 words
  ending on complete sentences; share-button text found in one was then removed.
- The range was then raised to 150–200 words at the user's request. Fourteen live
  articles produced openings of 151–172 words (1,084–1,292 characters, within the
  2,000-character column limit). Two list-style market reports ended on a heading
  line without a full stop. The applied migration's column comment still says
  100–150 words; applied history was not rewritten.
- All offline tests passed, including new opening-text, excerpt, theme, and
  collector tests; lint and TypeScript for project files passed.
- On the local dev server, an existing article showed the tidied excerpt, the
  "Added to briefing" date, the "Part of this week's trend" panel, and related AI
  stories in Continue exploring. The quoted opening was verified by tests only,
  because no stored article had one yet. No collection, commit, or deployment ran.

**Recorded local verification on 27 October 2026 (one card per story,
`dedupe-stories` branch):**

- The live Top stories showed three copies of one press release: Business
  Standard's regular and AMP pages and a Tribune India republication.
- Added AMP address normalization, collector same-headline skipping, and website
  grouping with "Also reported by" credits. All 114 offline tests passed,
  including new fingerprint, grouping, AMP, same-run, recent-story, and failed-read
  tests; lint, TypeScript for project files, `git diff --check`, and the production
  build passed.
- A read-only check of the 50 published rows grouped them into 44 stories. All six
  hidden copies had identical headlines apart from a matching publisher ending.
  A local production server showed four distinct Top stories, the Clinics On Cloud
  card linked to the regular Business Standard page with Tribune India credited,
  and article pages loaded. No database write, commit, or deployment was performed.

**Recorded local verification on 27 October 2026 (security baseline,
`security-hardening` branch):**

- Removed the public `/api/test-supabase` diagnostic and added the security headers
  above. Before the change, the production diagnostic returned internal database
  error text; the production cron route already rejected requests without its
  secret (HTTP 401); `npm audit --omit=dev` reported zero vulnerabilities; and no
  environment file or secret-looking key appeared in Git history.
- All 104 offline tests, lint, TypeScript for project files, `git diff --check`,
  and the production build passed. Stale generated types in the ignored
  `.next/dev/types` cache still referenced the removed route and were cleared.
- A local `next start` served all five headers on the homepage, article pages, and
  the cron route. The removed diagnostic redirected to login like other unknown
  private paths, the cron route still returned 401 without its secret, `/saved`
  returned 200, and a publisher image loaded in headless Chrome.
- No commit, deployment, database write, or dashboard setting change was performed.

**Recorded local verification on 26 October 2026 (image display improvements,
`image-improvements` branch):**

- Added image-first featured selection, branded and text-only fallbacks, small-image
  filtering, loading shimmer and fade-in, and images in Continue exploring, trend
  evidence, and saved stories.
- All 104 offline tests (21 reader tests, including new image-helper and saved-image
  tests), lint, TypeScript for project files, `git diff --check`, and the production
  build passed.
- Headless Chrome screenshots against the local site covered Top stories in dark
  desktop and light 390px mobile, trend evidence, and an article page with Continue
  exploring. Real publisher images loaded and faded in; branded placeholders showed
  publisher initials; no layout overflowed horizontally. Saved stories were covered
  by unit tests only. No database write, commit, or deployment was performed.

**Recorded local verification on 26 October 2026 (article images, `News_image` branch):**

- A read-only sample of 30 FreeNewsAPI.ai GCC HealthTech results returned an
  image address for 26. The collector now keeps HTTPS image addresses; the
  homepage featured story, Top stories, news stream, and article pages show them.
- All 99 offline tests (including a new image-validation test), full-project lint,
  TypeScript for project files, `git diff --check`, and the production build passed.
  iCloud-created duplicate files in the ignored `.next/dev/types` cache were removed
  because they broke type checking.
- The `image_url` migration was then applied to the linked Supabase project with
  `npx supabase db push`; it was the only pending migration. A publishable-key
  read of `image_url` succeeded: 45 published rows, none with an image yet,
  because articles collected earlier keep NULL images.
- **Not yet done:** nothing has been committed or deployed, and no collection has
  run with the new code. The deployed site does not request `image_url`, so it is
  unaffected by the new nullable column.

**Recorded local verification on 26 October 2026 (visual refinement):**

- All 16 reader tests, lint, TypeScript, `git diff --check`, and the standard
  production build passed. Changes are limited to presentation and documentation.
- Reviewed light/dark desktop and mobile screenshots of the homepage, articles,
  saved stories, and missing-article state; checked 320px and 768px homepage widths.
  Search, theme switching, and saving/removing stories worked in an isolated local
  browser. The production homepage also rendered correctly in both themes.
- No deployment or database write was performed.

**Recorded local verification on 26 October 2026 (weekly trend window):**

- Extended the rolling analysis window to seven days and changed the graph to
  seven daily periods. The heading, axis labels, accessible chart description,
  concise daily-story caption, analysis text, and quiet-state wording now describe
  this week. Visible momentum labels were removed to keep the section focused on
  the trend itself. The two-story,
  two-publisher evidence threshold and latest-24-hour momentum comparison remain.
- All 98 offline tests, lint, TypeScript, `git diff --check`, and the standard
  Next.js 16.4.3 production build passed. Regression coverage includes seventh-day
  stories, the exact 168-hour cutoff, and exclusion one millisecond before it.
- Rendered HTML checks confirmed seven bars, the day labels, secondary trends,
  supporting evidence, and the quiet state. The local homepage returned HTTP 200
  with the weekly heading. No deployment or database write
  was performed.

**Recorded local verification on 25 October 2026 (72-hour trend analysis):**

- Added the evidence-backed main trend, interactive “Also trending” choices,
  momentum graph, exact supporting stories, and an honest low-activity state.
- All 97 offline tests passed, along with lint, TypeScript, whitespace checks,
  and the Next.js 16.4 webpack production build.
- Browser checks covered the real low-activity state from two unrelated recent
  articles and a temporary populated fixture on desktop and 390px mobile layouts.
  Selecting a secondary trend updated both the main analysis and its evidence;
  neither layout overflowed horizontally. No database write or deployment was
  performed.

**Recorded local verification on 25 October 2026 (Next.js security patch):**

- Updated the exact pins for `next` and `eslint-config-next` from 16.4.0 to
  16.4.3, the latest stable 16.4.x release verified against npm that day.
  The lockfile updates their matching `@next/env`, `@next/eslint-plugin-next`,
  and eight platform-specific `@next/swc-*` packages to 16.4.3. Next.js now
  requires `sharp` >=0.35.5 within its 0.35.x range; the resolved version was
  already 0.35.5. All other resolved dependency versions are unchanged.
- The patch includes the fixes in the [14 October Next.js security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
  `npm audit --omit=dev` reports zero vulnerabilities. The full audit still
  reports three existing moderate findings in the Tailwind development dependency
  chain (`tailwindcss`, `postcss-nested`, and `postcss-selector-parser`).
- A clean `npm ci`, all 91 committed offline tests, full-project lint,
  `npx tsc --noEmit`, `git diff --check`, and the standard Turbopack production
  build (`npm run build`) passed on Node.js 24.19.0. The build required network
  access for Google Fonts and a fresh cache after a restricted worker-port error.
- This verification used an isolated branch based on commit `8ca3b11`.
  The uncommitted trending-news feature was excluded, and the original checkout
  was verified unchanged. Application code and configuration are unchanged;
  no merge, deployment, database write, or environment-file copy was performed.

**Recorded local verification on 22 October 2026 (saved stories):**

- Added save/remove controls across the public reading experience, a live header
  count, and the device-local `/saved` reading list with an empty state.
- All 91 offline tests, full-project lint, TypeScript, `git diff --check`, and a
  Next.js 16.4.0 webpack production build passed. The build prerendered `/saved`.
- Browser verification covered save, remove, empty state, persistence after a
  reload, and desktop/mobile dark-theme layouts. The 390px page had no horizontal
  overflow. No database write, account change, or deployment was performed.

**Recorded local verification on 22 October 2026 (reader freshness):**

- Added browser-local previous-visit tracking, a returning-reader status banner,
  new-story badges, and Today/Yesterday/Earlier news-stream groups.
- All 86 offline tests, full-project lint, TypeScript, `git diff --check`, and a
  Next.js production build passed.
- Browser verification covered first-time and returning visits, matching new-story
  counts and badges, the Today group, and desktop/mobile dark-theme layouts. No
  database write or deployment was performed.

**Recorded local verification on 21 October 2026 (daily Vercel Cron):**

- Added the secret-protected `/api/cron/collect-free-news` route and the daily
  `0 5 * * *` production schedule.
- All 82 offline tests, full-project lint, TypeScript, `git diff --check`, and a
  Next.js production build passed. The build lists the cron endpoint as a dynamic
  server route.
- No live collection, database write, Vercel environment change, or deployment
  was performed during this verification.

**Recorded pre-production review on 14 October 2026:**

- Reviewed every file in the feature branch and preserved the publication,
  duplicate, metadata, credential, RLS, and draft-only boundaries documented above.
- Updated Next.js and `eslint-config-next` to 16.4.0 after a production dependency
  audit found a critical advisory in 16.3.4. The final production-only audit
  reported zero vulnerabilities.
- All 78 offline tests, full-project lint, TypeScript, `git diff --check`, and the
  Next.js 16.4.0 production build passed.
- A current UAE 30-day FreeNewsAPI.ai dry run completed all three searches with
  30 raw results, 14 unique keyword matches, 5 overlapping URLs, 11 filtered
  results, no failures, and no database writes.
- The full dependency audit still reports development-only advisories in the
  Tailwind 3 and ESLint toolchains. Resolving those requires a separate breaking
  Tailwind 4 migration; they are absent from `npm audit --omit=dev`.

**Recorded local and hosted-database verification on 10 October 2026
(FreeNewsAPI.ai integration):**

- All 78 offline tests passed: 24 FreeNewsAPI.ai tests and the existing 54
  RSS/GDELT/relevance tests. Targeted lint, TypeScript, the production build,
  and `git diff --check` passed.
- A live dry run completed all 18 country/topic searches, examined 148 API
  results, rejected 107 with the basic keyword filter, and previewed 31 unique
  candidates without accessing Supabase.
- The approved live run completed all 18 searches and published those 31 new
  articles. The database grew from 21 to 52 rows; all 21 older rows were
  unchanged, and all 31 new rows had `status = 'published'`.
- A public-key database read returned 32 published articles, and the local
  homepage rendered the new titles, publisher names, excerpts, and source links.
- No code was committed or deployed. Because the existing deployment reads the
  same hosted Supabase database, its current article list can see the published
  rows; the new excerpt layout remains local until a later deployment.

**Recorded local verification on 10 October 2026 (slower GDELT collection):**

- Increased the request gap to 30 seconds and the single retry delay to 60 seconds.
  Longer server-requested cooldowns still stop the run without retrying early.
- All 54 offline tests passed (15 RSS, 28 GDELT, 11 relevance), including updated
  pacing, retry recovery, and cooldown tests. Targeted collector lint and
  `git diff --check` passed.
- A live `npm run collect:gdelt -- --dry-run --country uae --days 1` made two
  requests and ended with HTTP 429 after its retry. It skipped the remaining
  search, exited 1, and saved zero articles. Slower timing did not resolve rate
  limiting in this environment during this test.

**Recorded local verification on 8 October 2026 (GDELT integration):**

- All 54 offline tests passed: 15 original RSS, 28 GDELT/shared processing/CLI,
  and 11 relevance tests. The original RSS tests were preserved unchanged.
- Targeted lint (`npx eslint lib/*.mjs scripts/*.mjs tests/*.mjs`), TypeScript
  (`npx tsc --noEmit`), and `git diff --check` passed.
- A live `--dry-run --country uae --days 7` returned 5 candidate URLs from the
  technology query. Several were different publishers' copies of the same story.
  The sector query exhausted its retry on HTTP 429, and the command correctly
  exited 1 with separate success/failure counts. It saved zero articles.
- This proves a live JSON response can pass through the collector and that partial
  API failure is reported. It does not establish relevance, complete GCC coverage,
  sustained API availability, or live database insertion. Tests use synthetic
  metadata and a simulated database; there was no live write, migration, commit,
  deployment, or paid API call as part of this integration.
- Website/authentication files and existing dependency versions were unchanged.

**Recorded live verification on 16 September 2026:**

- First successful collection: 20 new drafts, no failures.
- Second successful collection: 20 duplicates, no new rows or failures.
- Database then contained 20 collected drafts and the unchanged published test article.
- Public database reads returned only the published article; drafts stayed hidden.
- All 15 collector tests, targeted lint, and TypeScript checks passed.

These counts are a dated checkpoint, not a guarantee of today's remote state.
The published seed article is fictional and links to `example.com`; its page is
`/news/saudi-healthtech-startup-expands-digital-care-platform`.

A production deployment was not part of the collector milestone. Check Git status,
remote migration history, and Vercel deployment separately when confirming what
is live.

## Next development step

The relevance rubric is written and the check is built, but **its accuracy has not
been measured**. Run `npm run check:relevance -- --gold` and record the result
here. Tune the rubric text until precision and recall are acceptable, remembering
that at roughly six relevant articles per month a single false positive is a large
share of what the site publishes.

Only then add the migration that stores verdicts, keeping relevance separate from
publication status. After that: country and category classification, which needs
its own labels; a review and publication workflow, where a person approves what
goes live; and a scheduled run with failure reporting.

The original single-source sample yielded six relevant articles in roughly four
weeks of feed. GDELT now offers additional discovery, but its relevant yield is
not yet measured. Review successful dry-run results across the six countries
before treating the expanded coverage as a reliable daily news supply.

Agents should read [AGENTS.md](AGENTS.md) before making changes. This README is the
shared project overview; keep it aligned with completed work.
