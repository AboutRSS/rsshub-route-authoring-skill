# Anti-patterns that block RSSHub route PRs

Distilled from **2,727 route PRs** containing **18,680 review comments** — 1,987 of them
merged, 740 closed without merging. 5,037 comments came from human reviewers, 589 from the
auto-review bot.

Every count below is the number of times that issue was raised in that corpus. Counts are
evidence of *how often reviewers notice something*, not of how often it is actually wrong —
but if reviewers notice it, you will have to answer for it.

Treat this as a record of what contributors most often need help with, compiled from reviews
written by volunteers working through a very large volume of PRs. The point of knowing it in
advance is to cost them less time, not to work around them.

### How to read the claims here

Every statement should carry one of three kinds of support. **If it has none, it does not
belong in this document** — and several things that used to be here for exactly that reason
turned out to be wrong.

| Support | Looks like | Checkable |
| --- | --- | --- |
| Corpus count | "`73 mentions`", a `Raised` column | yes — re-run `tools/` |
| Official rule | "`Rule 19`", "`AGENTS.md #21`" | yes — fetch the file |
| Observed in a PR | a quoted line, or a diff block | by hand |

Prose with none of these is unverified. `tools/verify-claims.mjs` checks the first two kinds
mechanically, because guesswork in this document is the failure mode that keeps recurring.

## Provenance

| | |
| --- | --- |
| Collected | 2026-09-11 |
| Corpus | 2,727 route PRs (1,987 merged / 740 closed without merge); 18,680 comments (5,037 human / 589 auto-review / 13,054 other bot) |
| Queries | `feat(route)` and `fix(route)`, each split into `is:merged` and `is:unmerged is:closed` |
| Reproduce | `node tools/fetch-reviews.mjs --full && node tools/analyze.mjs` |

Treat the **counts as perishable** — they drift as review practice changes and as the
auto-review bot's rule set evolves. Treat the **catalogue** (which behaviours get flagged at
all) as far more stable. If this document is more than a few months old, re-run the pipeline
before relying on the ranking.

The unmerged half of the corpus is included deliberately: merged PRs only show feedback that
was successfully addressed, so a corpus of merged PRs alone cannot tell you what gets
rejected.

---

## 0. Before you write the route

### Does the site already provide a feed or an API? — 81 mentions

The single most common reason a route is declined before any code review happens. The wording
is nearly identical every time:

> The proposed route duplicates content already available in the official RSS feeds and does
> not provide any unique value. Furthermore, the official RSS feeds are always updated with
> the latest content, while the proposed routes will always lag behind due to RSSHub internal
> caching.

Check first:

1. **Look at the site, not just the page.** `<link rel="alternate" type="application/rss+xml">`
   in the target page's head is the easy case, but homepages and footers often link a feed
   visibly — try to find one before giving up. A single `curl` of the homepage has caught a
   feed that an eight-path probe missed entirely.
2. **Probe per-section paths, not just the obvious ones.** A fixed list is not enough:

   | Pattern | Seen in the wild |
   | --- | --- |
   | Global | `/feed`, `/feed/`, `/rss`, `/rss.xml`, `/rss2`, `/atom.xml`, `/index.xml`, `/feed.xml` |
   | **Per-section** | `/feed/<section>/`, `/<section>/feed`, `/<section>/rss` |
   | Query style | `?feed=rss2`, `?format=feed`, `/feed/atom/` |

   The per-section form is the one most often missed, and it is common: a site can expose
   `/feed/news/` while `/news/feed` and `/feed` both 404.
3. Is there a public JSON API? (Also the preferred data source per the rules.)
4. If a feed exists and covers the same content, the route adds no unique value — and will
   always be behind because RSSHub caches. **Say so instead of submitting it.**

A feed does not always end the idea, though. It ends the idea only when it covers the same
content. A route is still justified when it adds something the feed does not:

- the feed truncates its summary and the detail pages carry the full text
- the section you want has no feed even though the rest of the site does
- the feed mixes sections and the user wants one

A route is justified when it adds something the official feed does not: full text, filtering,
a section with no feed, or a site whose feed is truncated.

---

## 1. Defensive code without evidence

This is the largest single source of review comments. Reviewers use a **templated,
rhetorical question** — they are not asking for an example, they are asking whether the code
has a reason to exist:

> Could you show me an example of the page structure containing multiple `X` elements that
> `first()` is needed to select the correct element?

> Could you show me an example of the page structure that there are leading/trailing spaces
> in `X` that `trim()` is needed?

> Does the response contain multiple `link` / `guid` / `title` elements within an item that
> you need to use `first()` in order to pick the right elements?

> Have you found a second `a > img` element within each `li` that requires using `first()`?

Variants begin with *Could you show me…*, *Does the … contain…*, *Have you found…*,
*Provide the URL where you found…*.

**Read it as a presumption, not a request.** The reviewer is saying "I believe this is
unnecessary" — they are not inviting you to explain your reasoning in prose.

In the corpus these questions almost always ended in removal, but **not always**: when a
contributor replied with a concrete count showing the selector genuinely matches several
elements, the construct was kept. So the correct response is not "always delete", it is
**re-run the check and answer with a number**:

- Count is **0** → delete the construct, reply with the count and the commit.
- Count is **greater than 0** → keep it, reply with the count and a sample of the markup
  that proves it.

What never works is answering "it is safer to keep it" or "just in case". That earns another
round of review. Either outcome is fine; only an unjustified one is not.

### `.first()` / `.last()` — 73 mentions

**Symptom**

```ts
const title = $('a[data-toggle="dropdown"] h3').first().text();
```

**Why it is flagged** — `.first()` asserts "the selector matches several elements and I want
the first". If it matches exactly one, the call is noise and hides the fact that you did not
check.

**Verify before writing it**

```js
const matched = $('a[data-toggle="dropdown"] h3');
console.log(matched.length); // 1 -> delete .first()
```

**Fix** — drop it. If the selector really does match several, narrow the selector instead of
indexing into the result.

### `.trim()` — 14 mentions

**Symptom**

```ts
const title = $item.find('a').text().trim();
```

**Why it is flagged** — whitespace padding lives *between* elements, not inside them. This
is the trap:

```html
<li> <span>26年09月09日</span> <a href="…">2026年9月9日 欧冠…</a> </li>
     ^ padding here                        ^ and here, not inside <a>
```

Because you select `a`, `.text()` is already clean. "The page is indented" is **not** a
valid reason to trim; "the selected element's own text is padded" is.

**Verify** — count how many items actually differ from their trimmed form:

```js
const padded = list.filter((i) => $(i).find('a').text() !== $(i).find('a').text().trim());
console.log(padded.length); // 0 -> delete .trim()
```

If the answer is not zero, keep it and paste the sample HTML in your reply.

### `?? ''` / `?? null` / `?? undefined` — 35 mentions

**Why it is flagged** — usually a downstream call already handles the falsy case, so the
fallback is dead code:

> Unnecessary `?? ''`. `…` will take care of the fallback value if
> `$article.html()?.replaceAll(/\s+/g, ' ').trim()` is falsy.

**Fix** — delete the fallback, or let the downstream default apply. Also applies to
**`if` guards around optional property assignment** ("Unnecessary if guards when assigning
optional properties") — just omit the property instead.

### The universal rule

> For every defensive construct you write — `.first()`, `.trim()`, `?.`, `?? fallback`,
> a custom `User-Agent`, a fallback date, a pagination parameter, a hardcoded `limit` —
> **produce a number that justifies it**. If you cannot, delete it.

The same question is asked of **unnecessary complexity that is not defensive at all**. Real
examples from the corpus:

> Why return a `Map`? Does the downstream consumers need `has()`, `get()` or `set()`?

> Can you show me which source file needs this type definition that this needs to be exported?

> Unnecessary `pMap`. Promise.all works fine.

So the test is broader than "is this defensive": **does anything actually need this?** An array
where an array suffices, an unexported type left unexported, `Promise.all` instead of a
concurrency helper — each is the same question wearing a different hat.

### How to answer when you are asked

Do not argue. Give the check you ran, the result, and the commit that removed it:

> Checked all 198 rows across every pagination page of both lists — the only `a` element
> always sits in the title cell, no row has a second one. Removed `.first()` in `affadfef`.

---

## 2. Redundancy of every kind — 166 mentions

"Unnecessary" / "redundant" / "not needed" is among the most common human feedback. It
applies to far more than method calls:

| What was called unnecessary | Note |
| --- | --- |
| Unnecessary `?? ''` | see above |
| Unnecessary `if` guards | — |
| Unnecessary `pMap` — "Promise.all works fine" | — |
| Unnecessary Playwright — "can be generated in JSDOM" | — |
| Unnecessary Puppeteer — "the site works fine with ofetch" | — |
| Useless file — "Put the radar inside `Route['radar']` instead" | — |
| Custom `limit` parameter / `.slice(0, N)` | use the built-in `limit` — see below |
| **A `features` block of all-`false` flags** | omit it unless a flag is `true` |
| **An empty `parameters: {}`** | omit it, or list the real path parameters |

**Takeaway:** before adding a dependency, a helper, a file, a browser, or a parameter, prove
the simple version fails.

### Do not write an all-`false` `features` block

```ts
// Noise: six flags that assert nothing.
features: {
    requireConfig: false,
    requirePuppeteer: false,
    antiCrawler: false,
    supportBT: false,
    supportPodcast: false,
    supportScihub: false,
},
```

Omit the block entirely when nothing is enabled. 59% of merged routes carry one, but much of
that is legacy, and a wall of `false` flags is exactly the kind of thing a reviewer asks you to
delete. Set a flag only when it is `true`, and make it match reality — `requirePuppeteer: true`
only when the route really drives a browser.

Likewise, a route with no path parameters should not carry an empty `parameters: {}`.

### No pagination parameters

An RSS feed requests the **first page only**. Do not expose `:page?`, `pageSize`, or any
"give me page N" parameter — readers poll the feed, they do not page through it. Fetch page
one and stop.

### No custom `limit` — use the built-in one (Rule 19 / AGENTS 32, 52 mentions)

This is the **single most frequently cited auto-review rule**. RSSHub already applies a
built-in `limit` common parameter to `data.item`. Do not:

```ts
const limit = Number.parseInt(ctx.req.query('limit') ?? '20', 10);
// ...
return { item: items.slice(0, limit) };
```

Do not slice to a fixed number either (`item.slice(0, 5)`). Just return every item you
fetched and let the common parameter do the trimming.

This is what it looks like when both are removed from a real route — note the Chinese comment
in the replacement, which is itself a violation (comments must be in English):

```diff
-    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 50;
     const $ = load(data);
-    const list = $('div.BH-lbox.GN-lbox2')
-        .children()
-        .not('p,a,img,span')
-        .not('[data-news-id]')
-        .slice(0, limit)
+    // 修正點 1: 使用 Object.hasOwn 檢查物件 key 避免 ESLint 警告
+    if (category && Object.hasOwn(categoryTable, category)) {
```

---

## 3. Hardcoded `User-Agent` — 30 mentions

The auto-review bot enforces this as a numbered rule, and it will fail your PR.

**Wrong**

```ts
const headers = { 'User-Agent': 'Mozilla/5.0 … Chrome/120.0 …' };
```

**Why** — RSSHub already sends a **randomised Chrome (macOS) User-Agent** through
`header-generator`. A hardcoded string defeats that and pins you to an outdated version.
`config.isDefaultUA` defaults to `true`, so omitting headers entirely is enough.

**Correct** — only pin a UA when the site genuinely requires that exact string:

> Use this UA only when the site works with this fixed string of user agent. Otherwise use
> RSSHub's default UA.

If you must set one, use `config.trueUA` from `@/config`.

**Also flagged:** hand-rolling HTTP with `node:tls` or raw sockets —
"this bypasses RSSHub's request layer entirely — no `config.trueUA`, no proxy support".
Always use `ofetch` / `got`.

### The same applies to `Referer` and other headers

> RSSHub will automatically use the origin as the referer. Do the API only work with this
> exact referer?

Do not add `Referer`, `Accept`, or similar headers by habit. Only add a header when the site
genuinely requires that exact value — and say so when asked.

This is what the anti-pattern looks like in a real diff, UA and `Referer` together:

```diff
     const response = await got({
         method: 'get',
-        url,
+        url: targetUrl,
+        headers: {
+            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/120.0.0.0 Safari/537.36',
+            Referer: 'https://gnn.gamer.com.tw/',
+        },
     });
```

Both lines had to come out.

---

## 4. `pubDate` — 99 mentions, of which fake dates 22

### No fake dates

Never fall back to `new Date()`. Never let an unparseable value become a date.

```ts
// Wrong: parseDate(undefined) -> dayjs(undefined).toDate() -> current time
pubDate: parseDate($('time').attr('datetime')!)

// Right
const datetime = $('time').attr('datetime');
pubDate: datetime ? parseDate(datetime) : undefined
```

Two distinct traps:

1. **Fallback to now** — `new Date()` as a default is explicitly forbidden.
2. **`Invalid Date` string** — `dayjs(x).format('YYYY-MM-DD')` returns the literal string
   `"Invalid Date"` for input it cannot parse. Guard the parse, return `undefined`.

### Event time is not publish time

The date an *event* occurs (exhibition opening, match kickoff) is **not** the date the
*entry* was published. Using it as `pubDate` scrambles reader ordering. Put event times in
`description` (or `_extra`) and leave `pubDate` to the real publish date — or omit `pubDate`
if the site exposes none.

### Timezone

When the source omits timezone information, normalise with `timezone(parseDate(…), <utc
offset>)` using the offset the site actually reports in. Do not apply `timezone()` twice; that
is also flagged.

---

## 5. `description` — 282 mentions (the most commented field)

- **Do not duplicate dedicated fields.** Author, `pubDate`, and tags have their own fields;
  repeating them in `description` is flagged.
- **Do not inline enclosures.** Media attached via `enclosure_url` is delivered alongside
  `description` by the reader — forcing it into the body is wrong.
- **Do not use the SEO meta description.** `meta[name="description"]` is not article content.
- **Do not truncate.** `desc.substring(0, 1000)` is flagged — return the full value.
- **Strip source noise** — inline `<script>`, hidden raw-data blocks, and leftover HTML
  comments like `<!--body开始-->` should be removed before rendering.
- **`\n` is not a line break in HTML.** It renders as a space. Use `<br>`.
- **Markdown in the route's `description` field** needs a blank line before and after
  admonition blocks (`:::`), lists and tables.

---

## 6. HTML construction: JSX, `raw`, or cheerio

Three related rules that look contradictory but are not:

| Situation | Use |
| --- | --- |
| You are **building markup** (an `<img>`, a `<video>`, a wrapper) | JSX + `renderToString` — Rule 25 |
| You are **embedding source HTML** inside JSX | `raw()` from `hono/html` — **never** `dangerouslySetInnerHTML` |
| You are **passing source HTML through** unchanged | cheerio composition, or `$(el).html()` directly |

**Never** build markup with template literals — Rule 25 flags
`` `<img src="${url}">` `` and suggests moving it into a `templates/*.tsx` component
rendered with `renderToString`.

`dangerouslySetInnerHTML` is rejected outright (3/3 mentions). The sanctioned replacement
is `raw`.

Removing comment nodes (cheerio):

```ts
$body.contents().filter((_, node) => node.type === 'comment').remove();
```

---

## 7. Images and media — 74 mentions

- Prefer the largest still image available; a 105×105 thumbnail is usually not the right
  choice when the detail page exposes a full-width one.
- Video thumbnails belong in the `<video>` element's `poster` attribute, not as a separate
  `<img>`.
- `enclosure_url` must point at the media file itself, and `enclosure_type` must be a real
  MIME type.

---

## 8. `categories` — 221 mentions

Wrong category is one of the most frequently corrected fields. Reviewers tend to answer with
a one-line suggestion:

```suggestion
    categories: ['new-media'],
```

Pick exactly **one** category. When unsure, look at how sibling routes for similar sites are
categorised rather than guessing.

---

## 9. Caching — 191 mentions

- Wrap **detail-page** fetches in `cache.tryGet()` — this is mandatory, not optional.
- Cache **the processed result, not the raw payload.** Storing the raw API object and
  re-rendering it on every request defeats the cache entirely.

  The distinction, from a real exchange: a helper already cached the raw API response, and the
  reviewer still asked for `cache.tryGet` around the object being constructed — because
  caching the payload still leaves the parsing and rendering work running on every request.
  Cache what you hand to `data.item`, not what you fetched to build it.
- Cache **the whole returned object**, not part of it:
  "Cache the whole returned object … instead of part of it."
- Do **not** cache the list request itself; that pins new items behind the content expiry
  window.
- Do not pass `refresh: false`, and do not hand-tune cache duration — 23 mentions.

---

## 10. Radar — 37 mentions

- **Never create `radar.ts`** — put rules in `Route['radar']`. A separate file is called a
  "useless file".
- `source` has **no protocol** and must keep the **same subdomain as the namespace `url`**.
  `scripts/workflow/build-routes.ts` buckets rules by the subdomain parsed from `source[0]`,
  so `source: ['example.com/x']` mismatches a namespace whose `url` is `www.example.com`.
- No **hash or query matching** in `source` — `song?id=:id` is not allowed; use `song`.
- `target` must **not** be namespace-prefixed (that yields a double slash).
- `target` must match the route path, and must **not** include a parameter the source URL
  does not contain.

---

## 11. Puppeteer — 79 mentions

- Don't use it when `ofetch` works.
- Don't reinvent helpers — use `@/utils/puppeteer-utils`.
- **Never open a browser session per item.** Parallel sessions are "simply DoS"; use
  `newPage` on one browser. (Enforced as a numbered rule: *Avoid Multiple Browser Sessions*.)
- Limit allowed request types; don't use fixed `setTimeout` — wait on selectors.

---

## 12. Names, examples and maintainers — 170 / 102 mentions

- `example` must be a **real, working path with concrete values**, matching `path`.
- **Missing maintainer GitHub ID** is called out constantly. Use your own handle — the
  maintainer is whoever will fix the route later.
- Route `name` must **not repeat the namespace name** ("中国国家博物馆 - 展览" → "展览").
- Namespace `url` must not include the `https://` prefix.

---

## 13. Titles and manual trimming (Rule 16)

RSSHub core handles title processing. Do **not**:

- `.trim()` a title
- slice a title to its first sentence
- truncate a description to a fixed length

Return the full text you found.

---

## 14. Selectors

- **No brute-force selection.** Collecting every anchor on the page (`$('a[href]')`) and then
  filtering by URL regex or `title.length < 8` is explicitly forbidden by the script
  standard. Scope the selector to the container that actually holds the items.
- Scope to a parent element and class name rather than matching globally.
- **Verify the selector before claiming what it contains.** Listing pages and detail pages of
  the same site frequently use different markup, and a class that names the *item* on a list
  page (`article callout small`) may name only the *header block* on the detail page — while
  the body sits in a differently named container. Print the element and a character count
  before asserting either.

---

## 15. Imports, file layout and types

- **Sort imports**: type imports first, then external packages, then `@/` internals.
- **`import type` is for types only** — a value import inside `import type` is flagged.
  Write `import { type Cheerio, load } from 'cheerio'` or split the statements.
- **Comments in English** (a numbered rule).
- Annotate the handler return type (`async function handler(): Promise<Data>`). Without it,
  a `language: 'en'` literal widens to `string` and fails to assign to `Language`.
- **No function definitions inside the item mapping loop** (Rule 50) — hoist helpers to
  module scope.
- Avoid out-of-scope changes — don't reformat or rename unrelated code in the same PR, and
  don't commit duplicate copies of files (including stray root-level copies).

---

## 16. Links

- `link` must be an **absolute URL** — use `new URL(href, baseUrl).href`.
- Each item needs a **unique link** (it becomes the `guid`).
- Strip volatile query parameters so the guid stays stable.

### Joins must not fail silently

When a value comes from joining two sources — a `__NEXT_DATA__` payload keyed by post id, plus
the anchors rendered in the same response — the lookup returns `undefined` with no error.
`Map.get()` is typed `string | undefined` for a reason.

A route that quietly emits items without a `link` is worse than one that throws: the feed looks
healthy, the entries do not work, and `guid` may collide. Guard the join:

```ts
const link = linkById.get(post.id);
if (!link) {
    throw new Error(`No link found for post ${post.id}`);
}
```

**This is not the defensive code §1 rejects.** `?? ''` adds a fallback that *hides* a missing
value; throwing makes it visible. The rule is: guard against being wrong, not against being
unconfirmed.

---

## 17. Error handling — 26 mentions

- Error messages should be actionable and say what went wrong.
- Don't swallow exceptions to produce an empty item list — that hides a broken route. Let it
  fail so the route test reports it.

---

## 18. Source-specific conventions

Low frequency, high value: these come up rarely but decide the shape of the route when they
apply. Corpus counts are small because each only applies to one kind of site.

| Source | Convention | PRs |
| --- | --- | --- |
| Next.js / Nuxt | Read `__NEXT_DATA__` (or `__NUXT__`) from the page instead of scraping the rendered DOM | 13 |
| WordPress | Use the REST API — `/wp-json/wp/v2/posts` — rather than parsing the theme's markup | 8 |
| JSON-LD | If the page embeds `application/ld+json`, prefer it over HTML parsing | 6 |

The reasoning is the same as the general "prefer an API" rule: a structured payload survives
a theme redesign, a set of class names does not.

---

## 19. Why PRs are closed without merging

740 of the 2,727 PRs in the corpus were closed without merging. The distribution matters,
because it is not mostly about code quality:

| Reason | Count |
| --- | --- |
| Stale or abandoned | 225 |
| Invalid `routes` block | 45 |
| Automatically closed | 25 |
| Duplicate of something existing | 24 |
| Author blocked (vouch denylist) | 21 |
| Matched low-quality / spam signals | 18 |
| Superseded by another PR | 16 |
| Author withdrew it | 13 |
| Site no longer available | 13 |
| Out of scope | 2 |

### How the automation actually works

Read from `.github/workflows/stale.yml` and `pr-review.yml`:

| Trigger | Timing | Message |
| --- | --- | --- |
| No activity | stale after **23 days**, closed **7 days** later (~30 total) | "stale because it has been opened for more than 3 weeks with no activity" |
| Labelled `auto: DO NOT merge` (broken Docker build) | stale after **1 day**, closed the same day | "auto-closed because it has a broken Docker build without any fixes" |
| Matched low-quality / spam signals | immediately | "matched multiple low-quality/spam signals" |
| Author on the vouch denylist | immediately | "the author is explicitly blocked in the vouch list" |

Escape hatch: the `wait for upstream` label exempts a PR from the stale bot.

Three consequences:

- **Reply within about three weeks.** Silence is by far the largest cause of a PR dying — 225
  of the 740 closed ones. This is not a code-quality problem at all.
- **Never leave a broken Docker build unfixed.** The reviewer only runs after the Docker build
  test succeeds, and a PR labelled `auto: DO NOT merge` is closed within a day.
- **A malformed `routes` block gets the PR closed outright** (45 cases). Pure PR hygiene and
  entirely avoidable — see `pr-template.md`.

One more, aimed at agents rather than humans: the anti-spam filter is real and active. One
carefully written route with a real description beats a batch of near-identical ones.

---

## 20. Auto-review rule catalogue

### Where the rules come from

The bot does not invent its rules. `.github/workflows/pr-review.yml` reads
`.github/prompts/pr_review_rules.md` and hands that file to a model. Fetch the authoritative
list yourself:

```bash
gh api repos/DIYgod/RSSHub/contents/.github/prompts/pr_review_rules.md
```

It currently holds **26 rules**. Two consequences worth internalising:

- **The bot's rule numbers are not reliable identifiers.** The corpus cites `Rule 34`, `43`,
  `44`, `50`, `53`, `54` and others that exist in neither file. Most sit 4–5 above the
  equivalent AGENTS.md entry, which hints at an older AGENTS.md revision — but the offset is
  not constant and some pairings fit no scheme at all. **Match rules by substance, never by
  number.** See the section on unmatched numbers below.
- **Silence is not approval.** The bot is instructed to report "only clear and actionable
  violations" and to "ignore uncertain or low-confidence findings". It also only runs after
  the Docker build test succeeds. No comment does not mean no problem.

Counts below are how often each rule was raised across the corpus. Because the corpus includes
unmerged PRs, they lean towards *what blocks a PR* rather than *what a clean PR looks like*.

### Route Metadata and Docs

| # | Rule | Raised |
| --- | --- | --- |
| 4 | Radar `target` may be empty; if present it must match the route path and its parameters | 20 |
| 2 | Route name must not repeat the namespace name | 13 |
| 3 | Radar `source` must be a relative host/path — no protocol, no hash/query matching | 10 |
| 9 | Do not modify default values or working examples unless they are broken | 9 |
| 5 | Namespace `url` must not include the protocol prefix | 6 |
| 7 | `parameters` keys must match real path parameters | 4 |
| 1 | `example` must start with `/` and be a working route path | 2 |
| 8 | Keep route/docs lists alphabetical when touching sorted files | 2 |
| 6 | Use a single category in `categories` | 1 |

### Data Handling and Feed Quality

| # | Rule | Raised |
| --- | --- | --- |
| 13 | Use `parseDate()` for date fields when the source provides time | 17 |
| 11 | `description` contains article content only — no duplicated `title`/`author`/`pubDate`/tags | 16 |
| 15 | Keep each item `link` unique; feed-level `link` should be human-readable, not an API endpoint | 14 |
| 16 | Do not trim or truncate title/content manually | 11 |
| 10 | Use `cache.tryGet()` for detail fetches; cache the processed result, not raw HTML | 7 |
| 14 | No fake dates — no `new Date()` fallback when the source has no valid time | 7 |
| 12 | Extract tags/categories into the `category` field | 2 |

### API and Requesting

| # | Rule | Raised |
| --- | --- | --- |
| 19 | Use the common `limit` parameter instead of custom limit/query filtering | **52** |
| 21 | Use the built-in UA; `config.trueUA` when browser-like headers are needed | 20 |
| 18 | Fetch the first page only — no custom pagination behaviour | 6 |
| 17 | Prefer official API endpoints over scraping when available | 1 |
| 20 | Prefer path parameters over custom query parameters | 1 |

### Code Style and Maintainability

| # | Rule | Raised |
| --- | --- | --- |
| 24 | Keep imports sorted | 23 |
| 26 | Avoid unnecessary changes outside PR scope | 19 |
| 25 | Use JSX-based rendering (`renderToString`, template components) for custom HTML | 16 |
| 23 | Use `import type { … }` for type-only imports | 14 |
| 22 | Use `camelCase` naming | 9 |

### Numbers that match neither file

Review comments cite `Rule 28`, `29`, `30`, `32`, `34`, `40`, `42`, `43`, `44`, `48`, `50`,
`53`, `54`. None exist in the 26-rule `pr_review_rules.md`, and most are outside AGENTS.md's
49. They are listed because reviewers still enforce them and because you will meet them in
older comments — but **treat the numbers as opaque**.

| Cited as | Subject | Nearest AGENTS.md rule | Raised |
| --- | --- | --- | --- |
| 43 | Avoid multiple browser sessions | #38 (+5) | 8 |
| 53 | Comments in English | #48 (+5) | 8 |
| 32 | Built-in `limit` | #28 (+4) | 7 |
| 40 | No `referrerpolicy` attributes | #35 (+5) | 5 |
| 44 | Do not bypass empty checks | #39 (+5) | 4 |
| 42 | Use selectors, not fixed delays | #37 (+5) | 2 |
| 29 | Prefer APIs/feeds over scraping | #25 (+4) | 2 |
| 30 | No manual JSON escape decoding | #26 (+4) | 2 |
| 34 | No custom filtering parameters | #30 (+4) | — |
| 48 | Error handling | #43 (+5) | 1 |
| 50 | No function definitions inside the item mapping loop | #45 (+5) | 1 |
| 54 | Arrow function parentheses | #49 (+5) | 1 |
| 28 | No custom properties outside `DataItem` | #15 (+13, outlier) | 1 |
| 36 | Only ever seen in the pairing `Rule 21/36`; not identified on its own | — | — |

**What this is and is not.** Twelve of the thirteen sit either 4 or 5 above their AGENTS.md
counterpart, which suggests the model read an older AGENTS.md revision with a few more entries
ahead of those points. That is a hypothesis, not a finding:

- the offset is not constant (4 and 5 both appear, one case is +13);
- pairings such as `Rule 19/32` and `Rule 21/36` fit no numbering we can identify;
- `Rule 34` cannot even be counted — the string also matches the `rule34video` route name.

So the defensible conclusion is narrow but solid: **a rule number in a review comment is a
hint, not an identifier.** Resolve it against the actual text of the finding. If you need
certainty about what a number meant, ask a maintainer.

**The bot is not always right.** In the corpus it contradicted itself on `_extra` — once
calling it dead weight, elsewhere calling it a valid `DataItem` property. Judge its output
rather than obeying blindly.

---

## 21. Empty results and configuration

### Don't fake your way past the empty-items check

RSSHub errors when a route returns no items, and that is deliberate — it is how broken routes
get noticed. Do not:

- add `allowEmpty: true` just to silence it
- emit placeholder items ("暂无内容") so the list is technically non-empty

Both were flagged in review. If the source genuinely has nothing, let it be empty.

### Routes that need configuration

If the site requires a cookie, token or credential:

- read it from `config` (`@/config`), never hardcode it
- declare `features.requireConfig` as a **list of descriptors**, not a bare `true` — this is
  the form used by current routes:

  ```ts
  features: {
      requireConfig: [
          {
              name: 'ONLYFANS_COOKIE',
              optional: true,
              description: 'The `Cookie` header of a logged-in session.',
          },
      ],
      nsfw: true,
  },
  ```

- keep the error actionable when it is missing — RSSHub throws `ConfigNotFoundError` naming
  the variable; do not swallow it

Do not add a new dependency to fetch secrets.

---

## 22. What accepted routes actually look like

The review corpus says what gets flagged. This is the other side — measured across **4,574
merged route files** in 1,978 namespaces, from a local checkout with no API calls:

```bash
node tools/analyze-routes.mjs <path-to-rsshub>
```

| Feature | Routes | Share |
| --- | --- | --- |
| `maintainers` | 3,812 | 83.3% |
| imports `parseDate` | 2,734 | 59.8% |
| has a `features` block | 2,708 | 59.2% |
| has `radar` | 2,505 | 54.8% |
| uses `cache.tryGet` | 2,003 | 43.8% |
| imports `got` | 2,160 | 47.2% |
| imports `ofetch` | 1,419 | 31.0% |
| uses `new URL(` | 1,102 | 24.1% |
| imports `timezone` | 943 | 20.6% |
| sets `language` | 609 | 13.3% |

Only **13.4%** of route files are `.tsx` — most routes need no JSX at all.

How to read this:

- **`maintainers` at 83%** confirms it is expected, not optional politeness.
- **`radar` at 55%** means it is common but genuinely optional.
- **`language` at 13%** means you should not add it reflexively.
- **`features` at 59%** — and since it is usually a block of `false` flags, omitting it is
  defensible. Match reality when you do include it.
- **`cache.tryGet` at 44%** tracks routes that fetch detail pages, which is exactly when it is
  required.

### Category distribution

| Category | Routes | | Category | Routes |
| --- | --- | --- | --- | --- |
| `new-media` | 518 | | `bbs` | 120 |
| `social-media` | 271 | | `anime` | 118 |
| `programming` | 235 | | `shopping` | 83 |
| `traditional-media` | 213 | | `picture` | 74 |
| `multimedia` | 180 | | `study` | 69 |
| `government` | 180 | | `journal` | 68 |
| `finance` | 165 | | `reading` | 65 |
| `game` | 162 | | `travel` | 56 |
| `other` | 141 | | `forecast` | 36 |
| `program-update` | 133 | | `design` | 34 |
| `blog` | 125 | | `live` | 16 |
| | | | `sport` | 14 |

24 categories are in use. `new-media` is far and away the most common at 11.3%; the tail
(`sport` at 0.3%, `live`, `design`) is tiny. If you find yourself reaching for a category in
the tail, double-check against how similar sites are categorised — a rare category is often a
sign of a wrong choice rather than a special case.

---

## Pre-submit checklist

- [ ] The site does not already provide an equivalent official feed or API
- [ ] Only the first page fetched; no `:page?` / `pageSize`
- [ ] No custom `limit` parameter, no `.slice(0, N)`
- [ ] No all-`false` `features` block, no empty `parameters: {}`
- [ ] Every cross-source join (payload key → rendered href) fails loudly when it misses
- [ ] Every `.first()` / `.last()` / `.trim()` / `?.` / `?? fallback` justified by a count
- [ ] No hardcoded `User-Agent`
- [ ] `pubDate` never falls back to `new Date()`, never emits `Invalid Date`
- [ ] Event time is not used as publish time
- [ ] `description` contains only body content, no duplicated fields, `<br>` not `\n`
- [ ] Titles and descriptions not manually trimmed or truncated
- [ ] Exactly one `categories` entry
- [ ] Detail fetches wrapped in `cache.tryGet`, caching the processed whole object
- [ ] Radar inline in `Route['radar']`; source subdomain matches namespace `url`, no query
- [ ] `example` is a real path matching `path`
- [ ] `maintainers` contains your own GitHub handle
- [ ] Imports sorted, `import type` used only for types, comments in English
- [ ] Handler annotated `: Promise<Data>`
- [ ] Files are LF, no BOM
