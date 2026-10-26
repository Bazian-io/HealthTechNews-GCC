# Working on GCC HealthTech News

## Start here

- Read [README.md](README.md) for the goal, current milestone, commands, schema,
  and next steps. Keep that overview current when a milestone changes.
- Give the user short, beginner-friendly explanations. Follow their requested
  mode: teaching when they want to do the work, implementation when authorized.
- Inspect `git status` and relevant code before editing. Preserve unrelated work;
  existing uncommitted changes may belong to the user or another agent.
- Treat dated verification results as historical evidence. Local files, Git
  commits, remote database migrations, and Vercel deployments are separate states.

## Project direction

The core product is an automated GCC HealthTech collection and processing pipeline.
The public Next.js website is its reading layer.

The RSS collector reads one Saudi Ministry of Health English feed. A separate
GDELT DOC 2.0 JSON collector searches all six GCC countries. Both save drafts only.
FreeNewsAPI.ai is now the primary collector: it publishes new keyword-matched
articles directly, explicitly requested on 10 October 2026. Its terminal command
remains available, and Vercel Cron invokes its protected route daily at 05:00 UTC.
The homepage keeps the previous visit timestamp in browser storage, highlights new
articles, and groups the news stream by the day each article was added.
Readers can also save up to 100 stories in browser storage and manage them at
`/saved`; this reading list is device-local and does not write to Supabase.
The homepage analyzes the latest 72 hours of published coverage into evidence-
backed, multi-publisher trends and shows an honest low-activity state when no
topic meets that threshold.
The optional Claude relevance checker is read-only and is not
invoked by collection. Search/relevance quality still needs evaluation; collection
alone does not establish relevance. The review/publication workflow is still planned.

## Invariants to preserve

- RSS and GDELT collection remain draft-only. FreeNewsAPI.ai intentionally saves
  new matches as published; do not promote or overwrite existing drafts.
- Public article queries must remain restricted to `status = 'published'`.
  Preserve the database's RLS policy and public read-only permissions.
- Preserve unique `original_url` and `slug` constraints. Published slugs must
  contain a non-whitespace character; drafts may have no slug.
- Duplicate URL handling must not overwrite stored articles. The collector uses
  `onConflict: "original_url"` with `ignoreDuplicates: true` for this reason.
- Keep publisher `source_description` separate from editorial/AI `summary`.
  Missing source data stays empty; do not invent dates or country assignments.
- Keep `SUPABASE_SECRET_KEY` in backend code only. Never print secret values,
  commit environment credentials, or give this key a `NEXT_PUBLIC_` name.
- Website clients in `lib/supabase/` use the publishable key and cookies where
  appropriate. Collectors share a separate backend client in `lib/collector-utils.mjs`,
  re-exported from `lib/news-collector.mjs` for existing callers.
- Preserve RSS's Ministry of Health URL restriction. Shared normalization accepts
  other publisher domains for GDELT without rewriting their protocol or hostname.
- GDELT article-list `seendate` and `sourcecountry` must not populate `published_at`
  or article `country`. Keep unsupported metadata NULL. Do not fetch article bodies
  or invoke paid AI services as part of GDELT discovery.
- FreeNewsAPI.ai publisher country must not populate article `country`. Only
  valid, non-future dates with `date_source` of `jsonld` or `meta` are stored.
  Missing provenance stays NULL. Its keyword filter is approximate, not a
  verified relevance verdict. Public UI labels source descriptions as excerpts.
- Add new schema migrations under `supabase/migrations/`; do not rewrite applied
  history or reset the remote database as part of routine setup.
- Keep website query errors distinct from valid empty results and missing articles.
- Treat the 72-hour trend labels as transparent, rule-based briefing signals—not
  stored classifications or claims about the whole internet. A trend requires at
  least two related published stories from two distinct named publishers.

## Verification and operational notes

- Use Node.js 22+ and `npm ci` with the existing lockfile.
- Collector checks: `npm run test:collector`, `npm run test:gdelt`,
  `npm run test:free-news`, `npm run test:relevance`, and
  `npx eslint lib/*.mjs scripts/*.mjs tests/*.mjs`.
- Browser-local reader features check: `npm run test:ui`.
- TypeScript check: `npx tsc --noEmit`. Production build: `npm run build`.
- `npm run collect:news -- --dry-run` fetches the live feed but never accesses
  Supabase. `npm run collect:news` writes drafts to the configured database.
  Fixture tests make no live requests. Choose checks appropriate to the task.
- `npm run collect:gdelt -- --dry-run` searches GDELT without loading credentials
  or accessing Supabase; omit `--dry-run` to save drafts. Optional `--country` and
  `--days` bound a run. Avoid overlapping GDELT runs; pacing is per process.
- GDELT CLI exits nonzero for failed/skipped searches or failed saves. Respect
  bounded retries and `Retry-After`; never treat API failures as valid empty results.
- `npm run collect:free-news -- --dry-run` previews without credentials/database
  access. Omit `--dry-run` to publish new keyword-matched articles immediately.
  Optional `--country` and `--days` (1–30) bound a run. New published rows affect
  every website sharing the configured database, even without a code deployment.
  Existing RSS/GDELT commands and public read-only RLS remain unchanged.
- `/api/cron/collect-free-news` runs the same FreeNewsAPI.ai collector. Keep it
  protected by Vercel's backend-only `CRON_SECRET`; the production schedule is
  `0 5 * * *` in `vercel.json`. The route must bypass login redirects so Vercel's
  authorized GET reaches the handler.
- Full-project lint should pass. The Tailwind plugin uses an ESM import so it is
  compatible with the Next.js 16 ESLint flat configuration.
- Next.js has Cache Components enabled. Article pages currently use
  `instant = false` for request-time reads; consult installed docs before changing it.
- `/protected` and authentication tutorial components are starter material, not
  an editorial dashboard. The current proxy redirects most other unauthenticated
  routes to login; the cron route deliberately bypasses that redirect and authenticates
  its Vercel bearer secret in the route handler.
- Update documentation with completed behavior and actual checks. Do not describe
  planned features or a local change as deployed without verification.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
