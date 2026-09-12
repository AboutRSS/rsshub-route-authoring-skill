# Contributing

Three ways to help, in increasing order of commitment.

## 1. Correct something that is wrong

Open an issue with the **correction** template. These take priority over everything else — a
skill that confidently states something false is worse than one that says less.

## 2. Report a review observation

Open an issue with the **observation** template. Use it when a reviewer raised something this
skill does not cover, or when the bot was simply wrong.

Please keep quotes to 300 characters and do not include anything private.

## 3. Refresh or extend the corpus

```bash
npm i
npm run fetch     # collect PRs from GitHub (needs `gh auth login`)
npm run analyze   # rebuild counts, rules, themes
```

Then open a pull request with the regenerated numbers and an updated `references/`.

You can also measure accepted routes directly from a local checkout — no API calls, no rate
limit:

```bash
node tools/analyze-routes.mjs <path-to-rsshub-checkout>
```

---

## The evidence threshold

**This is the part that keeps the skill honest.** A rule enters `references/anti-patterns.md`
only if one of these holds:

- it carries an official rule ID from `.github/prompts/pr_review_rules.md` or `AGENTS.md`; or
- it has been observed **at least three times independently** in the corpus; or
- it is already written in `AGENTS.md` or the official docs.

Explicitly excluded:

- single instances — one reviewer's phrasing is not a convention;
- pure style preferences;
- bot findings that were rejected on review (these go in the known-false-positives list
  instead, which is itself useful).

Observations that do not yet meet the threshold are labelled `needs-more-evidence` and left
open. They are not wasted: the corpus grows, and a later observation may be the third.

## How credit works

Reading this before you contribute is the point of it.

- **Your issue stays yours.** It is not deleted or squashed away when the finding is merged.
  The issue number is the permanent record.
- **Closing comment names what changed.** Something like "Added to anti-patterns.md §9,
  thanks" — so you can see where it landed.
- **Commit trail.** Changes that come from an observation are committed with
  `Reported-by: <you> in #<issue>`.
- **The document itself carries no personal names.** That is deliberate and consistent: we do
  not name the RSSHub reviewers either. Naming people inside the guidance would turn it into a
  credits list and make every edit a question of who to add or remove.

To be explicit about the split: the contributor supplies a **fact** (what a reviewer said),
the maintainers supply the **synthesis** (whether it is a rule, how it is worded, where it
goes). Both are real contributions, and neither is the whole of it.

If you would like different attribution — or none at all — say so in the issue and it will be
honoured.

## A note on `tools/data/`

That directory is gitignored on purpose. It holds raw review comments — real GitHub usernames
and verbatim text from third parties. **Please do not commit it, and do not remove the
`tools/data/` line from `.gitignore`.** Only distilled rules and short, truncated exemplars
belong in the published repository.

## What we do not want

- Private information, or anything from a non-public review.
- Whole review threads pasted verbatim.
- Rules inferred from a single PR.
- Anything that names and criticises an individual reviewer.
