# tools/

The data pipeline behind this skill.

Every claim in `references/` is meant to be traceable to real reviewer feedback, not to
the author's intuition. This directory contains the scripts that produce that evidence.

## Who this is for

**Not loaded when the skill runs.** It exists so that anyone who forks this repository can
verify or refresh the evidence in `references/` for themselves.

## Data and terms

- Reads **public data only**, through GitHub's official GraphQL API. No website is scraped.
- Runs as **you** — the scripts shell out to `gh`, so requests are authenticated with your own
  account and count against your own rate limit. No token is stored in this repository.
- Respects rate limits: `rateLimit.remaining` is checked after every page and the script sleeps
  until the window resets when it runs low. A full run uses well under the hourly allowance.
- **Raw comments are not redistributed.** `tools/data/` is gitignored and stays on your
  machine; only distilled rules and heavily truncated exemplars are committed.

## Requirements

- [GitHub CLI](https://cli.github.com/) installed
- Authenticated: `gh auth status` (run `gh auth login` if it fails)

The scripts shell out to `gh api graphql`, so no personal access token is ever written
to disk, passed on the command line, or committed.

## Usage

```bash
# 1. Verify the output shape with a single page (recommended first run)
node tools/fetch-reviews.mjs --pilot

# 2. Collect the full corpus (Search API caps at 1000 results)
node tools/fetch-reviews.mjs --full
```

## Scripts

| Script | What it does | Hits the API |
| --- | --- | --- |
| `fetch-reviews.mjs` | collects PRs and their review comments | yes, GraphQL |
| `analyze.mjs` | reduces the corpus to counts, rules, themes and discovered terms | no |
| `analyze-routes.mjs` | measures what *merged* routes look like, from a local checkout | **no** |
| `fetch-diff-hunks.mjs` | pulls the code under discussion for the top rules | yes, REST |

`analyze-routes.mjs` is the other half of the picture: the corpus says what gets flagged, this
says what accepted code looks like. Because it reads the filesystem it costs nothing to run:

```bash
node tools/analyze-routes.mjs <path-to-rsshub-checkout>
```

## What it collects

| Source | GraphQL field | Why |
| --- | --- | --- |
| PR metadata | `number`, `title`, `mergedAt`, `closedAt`, `state` | Sorting, linking back to the PR, and telling merged from closed |
| Issue comments | `comments` | Where the auto-review bot posts its numbered rules |
| Inline review comments | `reviewThreads` | Where human reviewers leave line-level feedback |

Four search queries run:

| Query | Purpose |
| --- | --- |
| `is:merged "feat(route)"` | New routes that were accepted |
| `is:merged "fix(route)"` | Route fixes that were accepted |
| `is:unmerged is:closed "feat(route)"` | New routes that were **not** accepted |
| `is:unmerged is:closed "fix(route)"` | Route fixes that were **not** accepted |

The unmerged half matters because merged PRs only show feedback that was successfully
addressed. Closed-without-merge PRs show what gets rejected outright — a different signal,
and the one most likely to be missing from a guide written by looking only at successes.
They are capped at 20 pages each since they are a sample of failure modes, not a census.

## Output

- `tools/data/pages/*.json` — raw per-page responses, so an interrupted run can resume
- `tools/data/reviews-raw.json` — merged, de-duplicated flat list

Both are gitignored. Only distilled exemplars are committed under `references/`.

## Rate limits

GitHub's GraphQL API allows 5000 points per hour for authenticated users. The script
checks `rateLimit.remaining` after every page and sleeps until `resetAt` when it drops
below 200. A full run costs well under the cap.

Search results are capped at 1000 per query by GitHub, which is why the script splits the
work across queries and pages of 20 PRs. Cached pages are reused, so re-running only costs
the pages you do not have yet.
