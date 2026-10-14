# GCC HealthTech News

An automated GCC HealthTech news collector in development, with a Next.js website
for reading published articles. The main product value is the collection and
processing pipeline.

GCC covers Saudi Arabia, the United Arab Emirates, Bahrain, Kuwait, Oman, and Qatar.
The goal is to have fresh, relevant news ready on the website each morning.

## Current milestone

**As of 14 October 2026:** FreeNewsAPI.ai is the primary news source for this
initial version. Its collector automatically publishes new articles that pass a
basic GCC HealthTech keyword filter, as explicitly requested. RSS and GDELT remain
available and save drafts only. The feature branch is not deployed until it is
merged and the production deployment completes.

| Working now | Still to build |
| --- | --- |
| Published article list and individual article pages | Validate relevance accuracy and store verdicts |
| Database error messages and article-not-found page | Summarization and classification |
| Unique slugs; published articles must have a nonblank slug | Review/publication workflow |
| FreeNewsAPI.ai collection and publication; RSS/GDELT drafts; duplicate URL checks | Scheduled collection with cron |
| Collector tests, dry-run preview, and run counts | Cross-publisher story matching |
| Optional read-only Claude relevance checker and labelled examples | Review GDELT search quality against real results |

The website has been deployed on Vercel. Collectors currently run from a terminal;
there is no collector API endpoint or cron schedule in this repository.

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
separate, optional relevance command. Vercel supplies `VERCEL_URL` for website
metadata.

### Database setup

Migration files live in [supabase/migrations](supabase/migrations). The nine
migrations listed below were applied to the remote project during this milestone.
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
readers. Publication happens in the terminal collector, never during a page view.
There is no automatic schedule yet; run the command when you want fresh stories.

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
- Leaves `country`, `category`, and editorial `summary` NULL. Source descriptions
  remain separate and are labelled “Publisher excerpt” in the UI. Dates are kept
  only with `date_source = jsonld` or `meta` and a valid, non-future timestamp;
  missing provenance and crawl-time fallbacks stay NULL.
- Reuses the existing duplicate-safe insert. Existing rows, including drafts
  from RSS/GDELT, are never overwritten or automatically promoted. Different
  publisher URLs for the same story can still appear separately.
- Fetches metadata only (`full_text=false`). It does not download article bodies,
  execute instructions in responses, or call an AI service. Original publisher
  attribution and links are retained. See the [provider's terms](https://freenewsapi.ai/legal/terms).

Requests are sequential with a one-second gap, 15-second timeout, and 2 MiB
response limit. Network failures, HTTP 429, and HTTP 5xx get at most one retry,
waiting at least two seconds and honoring `Retry-After`. A requested cooldown
above 30 seconds or repeated 429 stops remaining searches. Valid empty lists
succeed; malformed responses are failures. Successful results can still be
published during a partially failed run, which exits with code 1.

The command prints a starting message and a final JSON report. `found` counts
raw returned rows, `filtered` counts rejected keyword matches, `invalid` counts
unusable rows, and `saved` counts new published articles. `duplicates` includes
overlapping search results and existing database URLs. `searches` reports API
failures separately from database save failures. Dry runs save nothing and show
up to ten previews, but cannot identify duplicates already in Supabase.

No new database migration or dependency is required. The existing collection
metadata and backend INSERT/SELECT grants are sufficient.

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

Add a new migration for future schema changes; preserve already applied files.
If collector saves fail with code `42501`, check the collector grant migration
and the configured backend key.

## Code map and routes

| Location | Responsibility |
| --- | --- |
| [app/page.tsx](app/page.tsx) | `/`: published articles ordered by insertion time, newest first, with attributed source excerpts |
| [app/news/[slug]/page.tsx](app/news/[slug]/page.tsx) | `/news/[slug]`: published article details and original source link |
| [app/news/[slug]/not-found.tsx](app/news/[slug]/not-found.tsx) | Missing/unpublished article page |
| [lib/supabase](lib/supabase) | Website server/browser clients and login-cookie maintenance |
| [proxy.ts](proxy.ts) | Entry point for session handling and protected routes |
| [lib/news-collector.mjs](lib/news-collector.mjs) | Feed parsing, normalization, draft creation, backend inserts |
| [lib/collector-utils.mjs](lib/collector-utils.mjs) | Shared URL cleanup, draft/slug creation, backend client, duplicate-safe inserts |
| [lib/gdelt-collector.mjs](lib/gdelt-collector.mjs) | GCC queries, bounded JSON requests/retries, GDELT draft mapping |
| [lib/free-news-collector.mjs](lib/free-news-collector.mjs) | FreeNewsAPI.ai queries, basic keyword filter, bounded requests, published article mapping |
| [scripts/collect-free-news.mjs](scripts/collect-free-news.mjs) | FreeNewsAPI.ai collection/publication command and credential-free dry run |
| [scripts/collect-news.mjs](scripts/collect-news.mjs) | Terminal command, environment loading, result output |
| [scripts/collect-gdelt.mjs](scripts/collect-gdelt.mjs) | GDELT terminal command, country/lookback options, credential-free dry run |
| [scripts/list-drafts.mjs](scripts/list-drafts.mjs) | Read-only listing of collected drafts for relevance review |
| [lib/relevance.mjs](lib/relevance.mjs) | The written rubric, the exclusion rule, and the Claude verdict call |
| [scripts/check-relevance.mjs](scripts/check-relevance.mjs) | Terminal command; scores drafts and compares them to the labelled set |
| [tests/news-collector.test.mjs](tests/news-collector.test.mjs) | Collector tests using example feeds and a simulated database |
| [tests/gdelt-collector.test.mjs](tests/gdelt-collector.test.mjs) | Offline GDELT, shared processing, and command tests using synthetic responses |
| [tests/free-news-collector.test.mjs](tests/free-news-collector.test.mjs) | Offline FreeNewsAPI.ai, publication, duplicate, metadata, failure, and CLI tests |
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
`/api/test-supabase` is a connection diagnostic. There is no admin dashboard yet.

## Checks and recorded verification

```sh
npm run test:collector
npm run test:gdelt
npm run test:free-news
npm run test:relevance
npx eslint lib/*.mjs scripts/*.mjs tests/*.mjs
npx tsc --noEmit
```

The collector tests run without network or database access. Use `npm run build`
for a production build and `npm run start` to serve that build.

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
