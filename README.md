# rsshub-route-authoring-skill

An agent skill for authoring **PR-ready** RSSHub routes — code that survives code review, not
just code that runs.

> This is an unofficial community project. It is **not affiliated with, endorsed by, or
> connected to RSSHub or its maintainers.** It is a summary of publicly visible review
> feedback, offered as advice only: whenever it disagrees with `AGENTS.md`, the official docs,
> or a maintainer, **they are right and this is wrong**.

## Heads up: this skill has a feedback loop, and it never runs on its own

**If an agent uses this skill and a reviewer raises something it did not cover, the skill may
*offer* to report that back here. It will never do so unless you explicitly agree.**

Concretely, the skill is instructed to:

- **ask first, every single time** — no exceptions;
- never open an issue, open a pull request, edit a file, or make any network call about this
  repository unless you asked it to;
- if you decline, drop the matter entirely.

If you *do* agree, the report is filed with **your** GitHub account via `gh`, which means it
appears publicly under **your name**. Nothing leaves your machine otherwise.

This matters because the skill is built from real review feedback — but a feedback loop that
runs silently would be a betrayal of the person who installed it. So: visible, opt-in, and
always under your control. Details in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Provenance of the writing

The rule content here is derived from real review data and is reproducible with `tools/`.
The **explanatory prose was drafted with substantial AI assistance and reviewed by a human
contributor.** That combination has a particular failure mode worth stating plainly: AI-written
guidance tends to state patterns more confidently than the evidence supports.

Two consequences for readers:

- Every count in this repository can be recomputed with `npm run fetch && npm run analyze`.
- Any claim that carries **neither a count nor a rule ID** should be treated as unverified.

Most RSSHub route guides explain how to fetch and parse a page. That part is easy. The hard
part is the review. This skill is built from the review record itself, so that an agent can
get it right the first time and not spend a maintainer's evening on avoidable round trips.

## Thanks

RSSHub is maintained by volunteers who review an extraordinary volume of contributions. Every
number in this repository is a small window onto work they do for free. Nothing here is
intended as a way to game review — the goal is the opposite: send PRs that need less of their
time, and learn from what they have already had to explain hundreds of times.

## The evidence

Every claim traces back to real reviewer feedback, not to intuition:

| | |
| --- | --- |
| Corpus | **2,727 route PRs** from `DIYgod/RSSHub` — 1,987 merged, 740 closed without merge |
| Comments | **18,680** (5,037 human, 589 auto-review, 13,054 other bot) |
| Collection | GitHub GraphQL via `gh`; `feat(route)` and `fix(route)`, each split into merged and closed-without-merge |
| Reproduce | `npm i && npm run fetch && npm run analyze` |

The pipeline lives in [`tools/`](tools/) and is re-runnable, so the counts can be refreshed
as review practice changes. See the caveat at the bottom about what this data can and cannot
tell you.

## What reviewers most often have to ask for

Ranked by how often each subject comes up in human review comments:

| Subject | Mentions |
| --- | --- |
| `description` content | 282 |
| `categories` | 221 |
| cache usage | 191 |
| `example` path | 170 |
| redundant / unnecessary code | 166 |
| `maintainers` | 102 |
| `pubDate` | 99 |
| **the site already has an official feed** | **81** |
| Puppeteer | 79 |
| images and media | 74 |
| `.first()` / `.last()` | 73 |
| radar | 37 |
| `?.` / `?? ''` | 35 |
| hardcoded `User-Agent` | 30 |

The bolded row is the one a corpus of merged PRs alone would have missed: it comes mostly from
routes that were declined before any code review.

Read this as "where contributors most often need help", not as a list of traps. The most
common request is simply: *does this defensive construct actually have a reason to exist?*
Answering that with a count instead of an opinion is most of what this skill teaches.

## Install

This is a plain [Agent Skills](https://agentskills.io/specification) package: a folder with a
`SKILL.md` at its root. Anything that implements that standard can load it. Clone it into the
skills directory your agent reads, **keeping the repository name** — the spec requires the
`name` in the frontmatter to match the directory name.

```bash
git clone https://github.com/AboutRSS/rsshub-route-authoring-skill.git
```

| Agent | Skills directory | Status |
| --- | --- | --- |
| CodeBuddy | `~/.codebuddy/skills/` | verified |
| Antigravity | `~/.gemini/antigravity/skills/` | verified |
| Claude Code | `~/.claude/skills/` | documented, not verified here |
| Cursor | uses `.cursor/rules/*.mdc` — a different system | not applicable as-is |

On Windows the same paths are `C:\Users\<you>\.codebuddy\skills\` and
`C:\Users\<you>\.gemini\antigravity\skills\`.

Two things to know before it works:

- **Run `npm i` inside the skill folder once.** Only `scripts/` needs it (cheerio,
  iconv-lite); `references/` is plain Markdown.
- **The skill operates on an RSSHub checkout**, so the workspace it runs in has to be one, and
  `gh` has to be authenticated for rule fetching.

Antigravity also has project-level *Workflow* files at `.agent/workflows/*.md` that can invoke
a global skill; see its documentation if you want a slash command for this one.

If you fork this repository, replace the account name in the clone command above.

## Portability

The package uses only standard Agent Skills fields — `name`, `description`, `license`,
`compatibility`, `metadata`, plus `allowed-tools` (ignored by platforms that do not define it).
There is no platform-specific configuration, no environment file and no installer script.

**What limits portability is the environment, not the format:**

| Requirement | Needed for | Without it |
| --- | --- | --- |
| An RSSHub checkout as the workspace | everything — routes are written into `lib/routes/`, and `AGENTS.md` is read from the repo root | the skill has nowhere to work |
| Node.js | RSSHub itself, per its own `package.json` `engines` field | RSSHub will not start |
| pnpm 10 | installing RSSHub's dependencies | `pnpm i` fails |
| `gh`, authenticated | fetching `AGENTS.md` and `.github/prompts/pr_review_rules.md`, and everything under `tools/` | the auto-review rule list cannot be fetched |
| `npm i` inside this folder | `scripts/verify-selectors.mjs` and `scripts/pre-submit-check.mjs` | the verification scripts cannot run |

Everything in `references/` is plain Markdown and needs no setup on any platform — deliberately
so, since that is where most of the value lives.

`allowed-tools` is declared so platforms that support it can pre-authorise the small set of
commands this skill needs: file reads and edits, page fetches, and `git` / `node` / `npm` /
`pnpm` / `gh`. It has only been exercised on CodeBuddy and Antigravity. If it blocks something
on your platform, delete the line — it is optional.

## Usage

The skill activates on requests to write, fix or review an RSSHub route. Its core loop:

0. Set up the environment (RSSHub checkout, dependencies, dev server)
1. Read the repo's own `AGENTS.md` and the official docs
2. Confirm the route does not already exist
3. Prefer an API, then server-rendered HTML, then Puppeteer; first page only
4. Write `namespace.ts` + the route file
5. **Verify with evidence** — `scripts/verify-selectors.mjs` produces the counts
6. Submit using the current PR template
7. Respond to review, then clean up after merge

```bash
# Justify or kill .first() / .trim(), and check link absoluteness
npm run verify -- --url <page> --item <sel> --field <sel> --attr href --base <url>

# Static gate before committing (LF, BOM, hardcoded UA, pagination, fake dates, …)
npm run check -- lib/routes/<namespace>
```

Example output — this is the evidence a reviewer is asking for:

```
item selector  : .list_body_bd li  ->  35 item(s)

--- .first() / .last() justification
  items with >1    : 0 / 35
  => NOT justified — remove .first() / .last()

--- .trim() justification
  items where text !== text.trim() : 0 / 35
  => NOT justified — remove .trim()

--- links
  resolvable      : 35 / 35
  unique          : 35 / 35
```

Two of the evals cover the opposite case — where `.first()` *is* justified and must be kept
and defended with a count. "Always delete" would be as wrong as "always keep".

## Structure

```
SKILL.md                     main SOP
CONTRIBUTING.md              how to report feedback, and how credit works
.github/ISSUE_TEMPLATE/      structured forms for observations and corrections
references/
  anti-patterns.md           the corpus, distilled (21 sections, with counts)
  examples.md                API / HTML / Puppeteer route templates
  review-response.md         decoding comments, answer templates, CI checks, after merge
  engineering-traps.md       LF line endings, TS annotations, branch setup
  pr-template.md             current PR template and how to fill it
scripts/
  verify-selectors.mjs       produces the counts that justify defensive code
  pre-submit-check.mjs       static gate, scoped to files that differ from HEAD
evals/
  evals.json                 cases drawn from real merged PRs
tools/                       corpus pipeline, not loaded when the skill runs
```

## Related work

Three earlier skills cover RSSHub route authoring. This one is written independently rather
than forked, so it can disagree with them where the review record points the other way — but
they were here first and are worth reading.

| Repo | What it does well | Where the review record disagrees |
| --- | --- | --- |
| [ovo-Tim/rsshub-skill](https://github.com/ovo-Tim/rsshub-skill) | Broadest rule coverage; correctly forbids a separate `radar.ts`; vendors the docs as a submodule | Example handler omits `Context` / `Promise<Data>`; no warning about hardcoded `User-Agent` |
| [wha7ev9r/rsshub-route-skill](https://github.com/wha7ev9r/rsshub-route-skill) | Largest; only one with an eval set; strong "common pitfalls" section | Advises adding a `User-Agent` on 403 — the auto-review bot rejects that as a numbered rule; PR checklist and commit format are outdated |
| [ChuYinan2023/rsshub-route-developer](https://github.com/ChuYinan2023/rsshub-route-developer) | Clear six-phase workflow; notes that `pnpm run format` rewrites the whole repo | Instructs creating a separate `radar.ts`, which the rules forbid |

Structure follows `ovo-Tim/rsshub-skill`. The eval format follows `wha7ev9r/rsshub-route-skill`.
Thanks to all three for mapping the ground first.

## Caveats

Please read these before relying on the numbers.

- **Counts are a snapshot** (collected 2026-09-10). The *catalogue* of flagged behaviours is
  stable; the *ranking* is not. Re-run `tools/` before trusting it.
- **Counts are not proof of correctness.** They measure how often reviewers raise a subject,
  which is a proxy — not a verdict on whether any given instance is wrong.
- **Correlation is not causation.** For example, PRs containing images in their comments have
  a lower median time-to-merge (6.0h vs 8.8h) — but images include screenshots posted *by
  reviewers* while debugging, so this says nothing about whether contributors should attach
  screenshots. Only 135 of 2,727 PRs (5.0%) mention screenshots at all.
- **The unmerged half is not representative of rejection alone.** 225 of the 740 closed PRs
  simply went stale or were abandoned; others were closed by anti-spam automation. The counts
  describe what reviewers raise, not a rejection rate.
- **Platform coverage is uneven.** The shell snippets were exercised end to end on Windows;
  the macOS/Linux equivalents are provided but untested. Corrections are welcome. None of the
  substantive guidance — rules, anti-patterns, review response — depends on the platform.
- **The auto-review bot contradicts itself occasionally** — in this corpus it called `_extra`
  both invalid and valid. Judge its findings.
- **Nothing here overrides the target repository.** `AGENTS.md` and
  <https://docs.rsshub.app/joinus/> win whenever they conflict with this skill.

## License

MIT
