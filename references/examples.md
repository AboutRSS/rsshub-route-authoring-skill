# Route templates

Copy-paste starting points for the three fetch strategies, in increasing order of desperation.
All of them assume `lib/routes/<namespace>/` already has a `namespace.ts`.

Shared rules across every template:

- return **every** item you fetched — no `.slice()`, no custom `limit`
- absolute links via `new URL(href, baseUrl).href`
- `pubDate` from `parseDate`, never `new Date()`
- cache the **processed** result, not the raw payload

---

## 1. JSON API (preferred)

```ts
import type { Data, Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://example.com';

export const route: Route = {
    path: '/posts/:section?',
    categories: ['new-media'],
    example: '/example/posts/news',
    name: 'Posts',
    maintainers: ['<your-handle>'],
    radar: [{ source: ['example.com/posts'], target: '/posts' }],
    handler,
};

async function handler(): Promise<Data> {
    const currentUrl = `${baseUrl}/api/posts`;
    const data = await ofetch(currentUrl);

    const list = (data.items ?? []).map((entry) => ({
        title: entry.title,
        link: new URL(entry.url, baseUrl).href,
        pubDate: entry.published_at ? parseDate(entry.published_at) : undefined,
    }));

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detail = await ofetch(item.link);

                // Cache the processed result, not the raw response.
                return { ...item, description: renderBody(detail) };
            })
        )
    );

    return { title: 'Posts', link: currentUrl, item: items };
}

// Hoisted to module scope — never define helpers inside the mapping loop.
function renderBody(detail) {
    return detail.body;
}
```

---

## 2. Server-rendered HTML

```ts
import { load } from 'cheerio';

import type { Data, Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';

const baseUrl = 'https://example.com';

async function handler(): Promise<Data> {
    const currentUrl = `${baseUrl}/latest`;
    const $ = load(await ofetch(currentUrl));

    const list = $('ul.entries > li')
        .toArray()
        .map((el) => {
            const $el = $(el);
            return {
                title: $el.find('h2').text(),
                link: new URL($el.find('a').attr('href')!, baseUrl).href,
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const $detail = load(await ofetch(item.link));
                const $body = $detail('.article-body');

                // Strip scripts, hidden blocks and leftover comments.
                $body.find('script, div[style*="display:none"]').remove();
                $body
                    .contents()
                    .filter((_, node) => node.type === 'comment')
                    .remove();

                return { ...item, description: $body.html() };
            })
        )
    );

    return { title: 'Latest', link: currentUrl, item: items };
}
```

### Non-UTF-8 responses

```ts
import iconv from 'iconv-lite';

import got from '@/utils/got';

const response = await got({ method: 'get', url: currentUrl, responseType: 'buffer' });
const $ = load(iconv.decode(response.data, 'gbk'));
```

Use `gbk` for GB2312/GBK, `shift_jis` for legacy Japanese pages, and so on. `iconv-lite` is
already a dependency — do not add another one.

---

## 3. Puppeteer (last resort)

Only after confirming that `ofetch` cannot get the content.

```ts
import { load } from 'cheerio';

import type { Data, Route } from '@/types';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer';

export const route: Route = {
    // …
    features: { requirePuppeteer: true },
    handler,
};

async function handler(): Promise<Data> {
    const currentUrl = 'https://example.com/protected';
    const browser = await puppeteer();

    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (r) => (r.resourceType() === 'document' ? r.continue() : r.abort()));

        logger.http(`Requesting ${currentUrl}`);
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('ul.entries > li');

        const html = await page.content();
        await page.close();

        const $ = load(html);
        const list = $('ul.entries > li')
            .toArray()
            .map((el) => {
                const $el = $(el);
                return {
                    title: $el.find('h2').text(),
                    link: new URL($el.find('a').attr('href')!, currentUrl).href,
                };
            });

        const items = await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link, async () => {
                    // Reuse the SAME browser: newPage, never a new browser per item.
                    const detailPage = await browser.newPage();
                    await detailPage.goto(item.link, { waitUntil: 'domcontentloaded' });
                    const detailHtml = await detailPage.content();
                    await detailPage.close();

                    return { ...item, description: load(detailHtml)('.article-body').html() };
                })
            )
        );

        return { title: 'Protected', link: currentUrl, item: items };
    } finally {
        await browser.close();
    }
}
```

Key points, each of which has been flagged in review:

- **one** browser for the whole route; `newPage` per item
- request interception limiting what is allowed through
- `waitForSelector`, never a fixed `setTimeout`
- `page.close()` **and** `browser.close()`, the latter in a `finally`
- `logger.http` for the request, since Puppeteer traffic is not logged automatically
- `requirePuppeteer: true` must match reality

---

## 4. Embedding source HTML in JSX

When you build markup *and* need to include a raw fragment from the source:

```tsx
import { raw } from 'hono/html';
import { renderToString } from 'hono/jsx/dom/server';

const description = renderToString(
    <div>
        <img src={cover} />
        {raw(sourceHtml)}
    </div>
);
```

`raw()` is the sanctioned escape hatch. `dangerouslySetInnerHTML` is rejected outright.

If you are not building any markup at all, skip JSX entirely and pass the fragment through
with cheerio — then the file stays `.ts`.
