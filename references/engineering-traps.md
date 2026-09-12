# Engineering traps

Mechanical problems that block a route PR even when the route code itself is correct.
None of these are about RSSHub semantics — they are about the toolchain around it.

> Commands here were exercised end to end on Windows. Cross-platform Node one-liners are used
> wherever possible; where a shell-specific form is given, the macOS/Linux variant is untested.
> Corrections are welcome.

## Line endings must be LF

```
@stylistic(linebreak-style): Expected linebreaks to be 'LF' but found 'CRLF'.
husky - pre-commit script failed
```

The linter reads the working tree, so this depends on how the file was written rather than on
the repository. It is most common on Windows, where editors and generated files default to
CRLF, but any file copied from Windows or produced by a Windows-oriented generator can trigger
it on macOS or Linux too.

Convert before committing — this runs anywhere Node does:

```bash
node -e "const f='lib/routes/<ns>/<route>.ts';const fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"
```

Platform-native equivalents: `dos2unix <file>`, or `sed -i 's/\r$//' <file>` on macOS/Linux.

Prevent it: `git config --global core.autocrlf false`. With `autocrlf=true` git checks files
out as CRLF, so anything you create locally is CRLF while the linter — which reads the
working tree — keeps rejecting it.

Also write files without a BOM — choose plain "UTF-8" rather than "UTF-8 with BOM" in your
editor.

## Annotate the handler return type

```
error TS2322: Type '{ … language: string … }' is not assignable to type 'Data'.
  Types of property 'language' are incompatible.
    Type 'string' is not assignable to type 'Language | undefined'.
```

Without an explicit return type, `language: 'en'` — or any other field typed as a string
union — widens to `string` and fails to assign. Annotate:

```ts
async function handler(): Promise<Data> {
```

## Type the handler context

`async function handler(ctx)` triggers `noImplicitAny`. Either import the type:

```ts
import type { Context } from 'hono';

async function handler(ctx: Context): Promise<Data> {
```

or drop the parameter entirely when the route has no path parameters.

## Typecheck is repo-wide

A full `tsc --noEmit` covers every file, so an **unrelated** problem fails your commit:

```
lib/routes/zhihu/jsdom.ts:1:39 - error TS2307: Cannot find module 'jsdom'
```

That is a missing dependency, not your bug. Confirm it really is missing, then finish the
install (`pnpm i`, or delete `node_modules` and reinstall). Do not work around it by editing
unrelated files.

```bash
node -e "console.log(require('fs').existsSync('node_modules/jsdom'))"
```

## `pnpm run format` touches the whole repository

Running the formatter rewrites every file, so your diff fills with unrelated changes. After
running it:

```bash
git checkout -- .
git add lib/routes/<ns>/
```

Or scope the formatter to your own paths.

## Branch setup (before you start)

- Open each new branch from an up-to-date `master`, never from another feature branch:

  ```bash
  git checkout master
  git pull upstream master
  git checkout -b feat/<site>-<what>
  ```

- **Never click "Sync fork" while viewing a feature branch.** GitHub merges upstream into
  *that* branch, creating a stray merge commit and leaving it looking "ahead" of upstream.
  Sync from the default branch, or use the CLI above.

Cleanup *after* the merge — deleting the branch, keeping the fork — is in
`review-response.md`.

## Commit message

```
feat(route): add <site> <what> route
```

Fixes during review use `fix(route): <what>`. The PR is squash-merged, so intermediate
messages matter less than the final PR title.

## PR description

- The `routes` block takes **concrete paths with real values**, one per line:
  ```routes
  /98zhibo/zuqiujijin
  ```
- Never write `NOROUTE` for a route PR — it is auto-closed.
- As of 2026-09-10 the template has five checklist items (New Route, Anti-bot or rate limit,
  Date and time, New package added, Puppeteer), but **always confirm against the template
  GitHub injects into the PR form** — it drifts. Older checklists in tutorials
  (Documentation, Full text, Use cache) are outdated.
- A screenshot of the feed output is optional; see `pr-template.md`.
