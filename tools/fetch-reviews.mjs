#!/usr/bin/env node
/**
 * Collect review feedback from merged RSSHub route PRs.
 *
 * Prerequisite: GitHub CLI installed and authenticated (`gh auth status`).
 * The script shells out to `gh api graphql`, so no token is ever handled here.
 *
 * Usage:
 *   node tools/fetch-reviews.mjs --pilot   # fetch a single page to verify the output shape
 *   node tools/fetch-reviews.mjs --full    # fetch up to 1000 PRs (Search API hard cap)
 *   node tools/fetch-reviews.mjs --pages 5 # fetch a specific number of pages
 *
 * Output:
 *   tools/data/pages/<query>-<n>.json   raw per-page responses (resume friendly)
 *   tools/data/reviews-raw.json         merged flat list of PRs + their comments
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OWNER = 'DIYgod';
const REPO = 'RSSHub';

// Search API returns at most 1000 results, so keep PAGE_SIZE * MAX_PAGES <= 1000 per query.
// Depth matters more than breadth here: an early run with PAGE_SIZE 25 / comments 5 hit the
// per-PR comment cap on 686 of 1987 PRs, hiding most auto-review comments.
const PAGE_SIZE = 20;
const MAX_PAGES = 50;

const QUERIES = [
    { key: 'feat', q: `repo:${OWNER}/${REPO} is:pr is:merged "feat(route)" in:title sort:created-desc` },
    { key: 'fix', q: `repo:${OWNER}/${REPO} is:pr is:merged "fix(route)" in:title sort:created-desc` },
    // Merged PRs only show feedback that was successfully addressed. Closed-without-merge PRs
    // show what gets rejected outright — a different and complementary signal. Capped smaller
    // because this is a sample of failure modes, not a full census.
    {
        key: 'feat-closed',
        q: `repo:${OWNER}/${REPO} is:pr is:unmerged is:closed "feat(route)" in:title sort:created-desc`,
        pages: 20,
    },
    {
        key: 'fix-closed',
        q: `repo:${OWNER}/${REPO} is:pr is:unmerged is:closed "fix(route)" in:title sort:created-desc`,
        pages: 20,
    },
];

const DATA_DIR = join(import.meta.dirname, 'data');
const PAGES_DIR = join(DATA_DIR, 'pages');

function buildQuery(searchQuery, cursor) {
    const after = cursor ? `, after: ${JSON.stringify(cursor)}` : '';
    return `query {
  search(query: ${JSON.stringify(searchQuery)}, type: ISSUE, first: ${PAGE_SIZE}${after}) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        title
        createdAt
        mergedAt
        closedAt
        state
        author { login }
        comments(first: 20) { nodes { author { login } body createdAt } }
        reviewThreads(first: 20) {
          nodes {
            comments(first: 5) { nodes { author { login } body path line diffHunk createdAt } }
          }
        }
      }
    }
  }
  rateLimit { limit cost remaining resetAt }
}`;
}

function callGraphQL(query) {
    const raw = execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const json = JSON.parse(raw);
    if (json.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(json.errors, null, 2)}`);
    }
    return json.data;
}

function requireGh() {
    try {
        execFileSync('gh', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
        if (e.code === 'ENOENT') {
            throw new Error(
                'The GitHub CLI (`gh`) was not found on PATH.\n' +
                    '  - install it: https://cli.github.com/ (Windows: winget install --id GitHub.cli)\n' +
                    '  - authenticate: gh auth login\n' +
                    '  - on Windows, open a new terminal afterwards so PATH is refreshed'
            );
        }
        throw e;
    }
}

async function sleepUntil(resetAt) {
    const ms = Math.max(0, new Date(resetAt).getTime() - Date.now()) + 1000;
    console.log(`  rate limit low, sleeping ${Math.round(ms / 1000)}s until ${resetAt}`);
    await new Promise((r) => setTimeout(r, ms));
}

function flatten(pr) {
    const out = [];
    for (const c of pr.comments?.nodes ?? []) {
        if (!c?.body) {
            continue;
        }
        out.push({ kind: 'issue-comment', author: c.author?.login ?? null, body: c.body, createdAt: c.createdAt });
    }
    for (const thread of pr.reviewThreads?.nodes ?? []) {
        for (const c of thread?.comments?.nodes ?? []) {
            if (!c?.body) {
                continue;
            }
            out.push({
                kind: 'review-comment',
                author: c.author?.login ?? null,
                body: c.body,
                path: c.path ?? null,
                line: c.line ?? null,
                createdAt: c.createdAt,
            });
        }
    }
    return out;
}

async function run() {
    requireGh();

    const argv = process.argv.slice(2);
    const full = argv.includes('--full');
    const pilot = argv.includes('--pilot');
    const pagesArgIdx = argv.indexOf('--pages');
    const explicitPages = pagesArgIdx >= 0 ? Number.parseInt(argv[pagesArgIdx + 1], 10) : null;
    const defaultPages = full ? MAX_PAGES : pilot ? 1 : MAX_PAGES;

    mkdirSync(PAGES_DIR, { recursive: true });

    for (const { key, q, pages } of QUERIES) {
        const maxPages = explicitPages ?? Math.min(pages ?? MAX_PAGES, defaultPages);
        console.log(`\n=== [${key}] ${q}`);
        let cursor = null;
        let page = 0;
        let total = null;

        while (page < maxPages) {
            const cacheFile = join(PAGES_DIR, `${key}-${page}.json`);
            let data;

            if (existsSync(cacheFile)) {
                data = JSON.parse(readFileSync(cacheFile, 'utf8'));
                console.log(`  page ${page}: cached`);
            } else {
                data = callGraphQL(buildQuery(q, cursor));
                writeFileSync(cacheFile, JSON.stringify(data, null, 2));
                const rl = data.rateLimit;
                console.log(`  page ${page}: fetched (issueCount=${data.search.issueCount}, points left=${rl?.remaining})`);
            }

            total = data.search.issueCount;
            cursor = data.search.pageInfo.endCursor;
            page += 1;

            if ((data.rateLimit?.remaining ?? 1000) < 200) {
                await sleepUntil(data.rateLimit.resetAt);
            }
            if (!data.search.pageInfo.hasNextPage) {
                break;
            }
        }

        console.log(`  done: ${page} page(s), search reported ${total} PR(s)`);
    }

    // Merge cached pages into a flat file.
    const merged = [];
    for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(PAGES_DIR, file), 'utf8'));
        for (const pr of data.search?.nodes ?? []) {
            if (!pr?.number) {
                continue;
            }
            merged.push({
                number: pr.number,
                title: pr.title,
                author: pr.author?.login ?? null,
                createdAt: pr.createdAt,
                mergedAt: pr.mergedAt,
                closedAt: pr.closedAt,
                state: pr.state,
                merged: Boolean(pr.mergedAt),
                comments: flatten(pr),
            });
        }
    }

    // De-duplicate: the same PR can appear in more than one page.
    const byNumber = new Map();
    for (const pr of merged) {
        byNumber.set(pr.number, pr);
    }
    const final = [...byNumber.values()].sort((a, b) => b.number - a.number);

    const outFile = join(DATA_DIR, 'reviews-raw.json');
    writeFileSync(outFile, JSON.stringify(final, null, 2));

    const withComments = final.filter((p) => p.comments.length > 0);
    console.log(`\n=== Summary`);
    console.log(`  PRs collected      : ${final.length}`);
    console.log(`  PRs with comments  : ${withComments.length}`);
    console.log(`  total comments     : ${final.reduce((n, p) => n + p.comments.length, 0)}`);
    console.log(`  written to         : ${outFile}`);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
