# After you open the PR

## What the automated checks do

Knowing this in advance means you can pre-empt most of it. Observed across 1,987 merged route
PRs:

| Check | What it does | How often |
| --- | --- | --- |
| **Route generation** | Renders every path listed in the `routes` block and posts the result — `Success ✔️` or `Failed ❌` with the error, route path, Node version and git hash | present on **1,935 / 1,987** PRs (97%) |
| **Auto-review** | An LLM pass against the review rules, citing numbered rules (`Rule 25`, `AGENTS #18`). Re-runs on every push. | 589 comments |
| **Code scanning** | `github-advanced-security`: oxlint and CodeQL findings, posted as **inline comments on the offending lines**, each linking to `security/code-scanning/<n>` | 637 comments |
| **Copilot review** | `copilot-pull-request-reviewer` | 150 |
| **Deploy preview** | `vercel` | — |

Note that code-scanning findings arrive looking like review comments — they sit on a diff line
and cite a rule (`## oxlint / unicorn(prefer-number-coercion)`, `## CodeQL / Use of a broken or
weak cryptographic algorithm`). They are not maintainer feedback, and a large share of the
"comments" on any given PR are these. Fix them like any other lint error.

Consequences:

- **Everything in your `routes` block gets executed.** Listing a path that 500s fails the PR —
  this is how a malformed link (`https://site.example/undefined`) gets caught.
- The route test runs against the **real network**, so a transient upstream failure shows up
  here too.
- - The auto-review bot **clears itself** on the next push; you do not need to reply to it.
- The bot's own output format has changed during the period this corpus covers: earlier
  comments were a plain bullet list, later ones carry a severity badge (`![P2 Badge]`) and a
  "Useful? React with 👍 / 👎" footer. Do not rely on its formatting.
- The bot is not always right — in this corpus it called `_extra` both invalid and valid.
  Judge each finding.

You can watch all of it from the CLI:

```bash
gh pr checks
gh pr view --comments
```

## The iteration loop

1. Fix locally, commit as a **new commit** on the same branch
2. `git push origin <branch>`
3. Reply to each comment
4. Resolve each conversation
5. Re-request review

### Do not amend or force push once a review exists

Force-pushing replaces the commit the comments were anchored to. GitHub marks every review
comment **Outdated** and collapses the threads, and the *"Changes since your last review"*
diff — the thing reviewers actually read — is lost.

Use a plain commit instead. The PR is squash-merged upstream, so the commit count in your
branch is irrelevant. `git commit --amend` is fine **before** anyone has reviewed.

### Doing this without a mouse

All five steps are scriptable, which matters if you are an agent or just prefer the terminal:

```bash
# 1-2. commit and push
git commit -m "fix(route): remove unnecessary trim"
git push origin <branch>

# 3. reply to a review comment thread
gh api repos/DIYgod/RSSHub/pulls/<n>/comments/<comment-id>/replies -f body="Removed — …"

# 4. resolve a thread (needs the GraphQL thread id)
gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"<thread-id>"}) { thread { isResolved } } }'

# 5. re-request review
gh api repos/DIYgod/RSSHub/pulls/<n>/requested_reviewers -f 'reviewers[]=<handle>'
```

Thread ids come from the review threads query:

```bash
gh api graphql -f query='query { repository(owner:"DIYgod", name:"RSSHub") { pullRequest(number:<n>) { reviewThreads(first:50) { nodes { id isResolved } } } } }'
```

If you cannot resolve the id, replying is still worth doing — just say so, or leave the thread
for a human to close.

## Decoding comments

### Rhetorical questions mean "justify or remove"

> Could you show me an example of the page structure containing multiple `X` elements that
> `first()` is needed to select the correct element?

This is a presumption that the construct may be unnecessary, not a request for prose. See
`anti-patterns.md` §1: answer with a count.

### A bare ```suggestion block means "accept it"

Reviewers answer many issues with a GitHub suggestion:

    ```suggestion
        categories: ['new-media'],
    ```

Accept it. When there are several, use **Add suggestion to batch** and commit them together.

### "Please cache the returned object of \<permalink\>"

The link is a permalink to exact line ranges. Open it and wrap that whole returned object —
not a fragment of it.

## Answer templates

### You removed the construct

> Removed. Checked all 198 rows across every pagination page of both lists — the only `a`
> element always sits in the title cell; no row has a second one. Removed `.first()` in
> `affadfef`.

Structure: **what you checked → the count → the commit**.

### You kept the construct

> Kept: `ul.entries > li a[href^="/events/"]` matches 2 elements per item (cover link and
> title link), so `.first()` is required. Sample: `<a href="/events/x"><img …></a><a class=
> "info" href="/events/x">…</a>`.

Structure: **the count → sample markup**.

### After a substantive fix

> Fixed: the `all` page has an extra featured list (`ul.imsm-entries.thumb`) with a different
> markup, which produced a malformed link. Now only the main list (`ul.imsm-entries.list`) is
> used, and the name is read from the city switcher.

### Never say

- "It is safer to keep it"
- "Just in case"
- "I think the page might have…"

These invite another round. Either produce a number or delete the code.

## After merge

- **Delete the branch** — locally and on the remote:

  ```bash
  git branch -d <branch>
  git push origin --delete <branch>
  ```

  GitHub also offers a *Delete branch* button on the merged PR page. Leaving merged branches
  around produces "Compare & pull request" banners for code that is already merged, and
  clicking through opens an empty duplicate PR.

- **Deleting the branch does not affect the merged route.** The code lives in upstream
  `master`; the PR page, its comments and your authorship all persist. Only the branch is
  gone.

- **Keep the fork.** Deleting the fork leaves PRs pointing at a missing head repository.

- **Sync your `master` before the next route:**

  ```bash
  git checkout master
  git pull upstream master
  git push origin master
  ```

## What to expect

Maintainers are volunteers working through a large volume of contributions. Bot checks re-run
automatically on every push. A first response within a day or two is typical, and longer is
normal. Do not open a new PR to "refresh" an existing one — push to the same branch.
