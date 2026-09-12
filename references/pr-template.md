# PR template

> **The official template always wins.**
> GitHub injects the current template into the new-PR form, and it changes over time — the
> docs site and this file have each been out of date at points. **Before using this file, open
> the PR form and compare it.** If they differ, follow the injected one, and please update
> this file so the next reader does not have to.

## Template

    ## Involved Issue / 该 PR 相关 Issue

    Close #

    ## Example for the Proposed Route(s) / 路由地址示例

    ```routes
    /<namespace>/<route>/<concrete-value>
    ```

    ## New RSS Route Checklist / 新 RSS 路由检查表

    - [x] New Route / 新的路由
        - [x] Follows [Script Standard](https://docs.rsshub.app/joinus/advanced/script-standard) / 跟随 [路由规范](https://docs.rsshub.app/zh/joinus/advanced/script-standard)
    - [ ] Anti-bot or rate limit / 反爬/频率限制
        - [ ] If yes, do your code reflect this sign? / 如果有, 是否有对应的措施?
    - [x] [Date and time](https://docs.rsshub.app/joinus/advanced/pub-date) / [日期和时间](https://docs.rsshub.app/zh/joinus/advanced/pub-date)
        - [x] Parsed / 可以解析
        - [x] Correct time zone / 时区正确
    - [ ] New package added / 添加了新的包
    - [ ] `Puppeteer`

    ## Note / 说明

    <what the route does, how it fetches, what the description contains, where pubDate comes from>

## How to fill it in

### `routes` block

- Concrete paths with **real values**, one per line — never `:param` placeholders.
- Never `NOROUTE` for a route PR; it is auto-closed. (`NOROUTE` is only for non-route PRs.)
- **A malformed `routes` block gets the PR closed automatically.** 45 of the 740
  closed-without-merge PRs in the corpus died this way — the largest avoidable cause. Every
  entry must start with `/` and be a real, working route path.
- If a parameter is exhaustively enumerable (a fixed set of categories), list every
  combination. Do not try to enumerate open-ended values such as city slugs — use the
  parameterised path instead.

### Checklist

As of 2026-09-10 the template has **five** items. Older lists circulating in tutorials
(Documentation / Full text / Use cache) are outdated. **Confirm against the injected
template** — this is exactly the kind of detail that drifts.

Tick **Date and time** only when both apply:

- a real publish date is parsed, and
- the timezone is normalised — `timezone(…, <utc offset>)` for sources that omit timezone
  information.

If the site exposes no publish time, leave it unticked and say so in the Note. That is the
correct outcome, not a defect.

### Note

Cover:

1. What the route covers and which site it reads
2. The fetch strategy and why (API / server-rendered HTML / non-UTF-8 decoding / Puppeteer)
3. That only the first page is fetched
4. What each item's `description` contains
5. Where `pubDate` comes from — and, if the source also contains an event time, state
   explicitly that `pubDate` is the **publish** date rather than the event date

A second paragraph in the site's own language is welcome but not required.

### Screenshot

Optional, not a requirement. In the corpus only **111 of 14,968 review comments (0.7%)**
mention screenshots at all, though some maintainers do ask for one. Having the feed output
from `http://localhost:1200<example>` ready costs nothing, so it is worth capturing — just do
not treat it as a gate.
