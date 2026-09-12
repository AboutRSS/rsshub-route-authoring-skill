#!/usr/bin/env node
/**
 * Summarise the collected review corpus into something a human (or an LLM) can read.
 *
 * The raw corpus is several megabytes, far too large to inspect directly. This script
 * reduces it to counts, per-rule frequencies and a handful of exemplars.
 *
 * Usage:
 *   node tools/analyze.mjs
 *
 * Input:  tools/data/reviews-raw.json   (produced by fetch-reviews.mjs)
 * Output: tools/data/analysis.json      machine readable
 *         tools/data/analysis.md        human readable
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(import.meta.dirname, 'data');
const IN_FILE = join(DATA_DIR, 'reviews-raw.json');

const MAX_EXEMPLARS = 5;
const EXEMPLAR_BODY_CHARS = 600;

/** Accounts that are not humans. `vercel` posts deploy previews, `github-advanced-security` posts alerts. */
const BOT_AUTHORS = new Set([
    'github-actions',
    'github-advanced-security',
    'copilot-pull-request-reviewer',
    'chatgpt-codex-connector',
    'codecov',
    'codecov-commenter',
    'dependabot',
    'imgbot',
    'renovate',
    'vercel',
]);

const isAutoReview = (c) => (c.body ?? '').includes('pr-auto-review');
const isBot = (c) => (c.author ? BOT_AUTHORS.has(c.author) || /\[bot\]$/i.test(c.author) : false) || isAutoReview(c);

/**
 * Pull `Rule 25`, `[Rule 14 - No fake dates]`, `(Rule 25 — JSX-based rendering)` etc.
 * The trailing `\b` matters: without it a route named `rule34video` matches as "Rule 34".
 */
function extractRules(text) {
    const out = [];
    const ruleRe = /\bRule\s*(\d+)\b\s*[—–-]?\s*([^\]\)\n,]{0,60})/gi;
    for (const m of text.matchAll(ruleRe)) {
        out.push({ id: `Rule ${m[1]}`, label: cleanLabel(m[2]) });
    }
    const agentsRe = /\bAGENTS\s*#?\s*(\d+)\b(?:\s*[—–-]\s*(\d+))?/gi;
    for (const m of text.matchAll(agentsRe)) {
        out.push({ id: `AGENTS ${m[1]}`, label: m[2] ? `range to ${m[2]}` : '' });
    }
    return out;
}

function cleanLabel(raw) {
    return (raw ?? '')
        .replaceAll(/[*_`]/g, '')
        .replaceAll(/\s+/g, ' ')
        .replace(/[（(].*$/, '')
        .trim()
        .slice(0, 50);
}

/** Rough buckets used to spot recurring themes in free-form human feedback. */
const THEMES = [
    ['description-content', /\bdescription\b/i],
    ['category', /\bcategor(y|ies)\b/i],
    ['cache', /\bcache\b|tryGet/i],
    ['example-path', /\bexample\b/i],
    ['maintainers', /\bmaintainer/i],
    ['pubdate', /\bpubDate\b/i],
    ['optional-chaining', /\?\./],
    ['puppeteer', /\bpuppeteer\b/i],
    ['radar', /\bradar\b/i],
    ['defensive-first', /\bfirst\(\)/i],
    ['linebreak', /CRLF|\bLF\b|linebreak/i],
    ['user-agent', /user[- ]?agent|\btrueUA\b/i],
    ['jsx', /renderToString|\.tsx\b|JSX/i],
    ['defensive-trim', /\.trim\(\)/i],
    ['link-absolutize', /\bnew URL\(|absolute (url|link)|relative/i],
    ['nullish', /\?\?\s*(''|null|undefined)/],
    ['fake-date', /fake date|new Date\(\)|current time/i],
    ['pagination', /\bpaginat|page param|only the first page/i],
    ['dangerous-html', /dangerouslySetInnerHTML/i],
    ['official-feed-exists', /official (RSS|feed)|already (available|provided) in the official|(RSS|feed)s? (is|are) always updated|does not (provide|add) any unique value/i],
    ['error-handling', /try\s*\{|catch\s*\(|error message|throw new/i],
    ['cache-duration', /cache (duration|expire|ttl)|content-expire|refresh: false/i],
    ['image-handling', /og:image|thumbnail|poster=|<img\b/i],
    ['type-assertion', /\bas DataItem\b/],
    ['unnecessary', /\bunnecessary|redundant|not needed\b/i],
];

/** How reviewers phrase their requests — useful for teaching an agent to read between the lines. */
const PHRASINGS = [
    ['反问式举证', /could you show me an example|show me an example|can you show/i],
    ['直接否定', /\bdo not\b|\bdon't\b/i],
    ['要求移除', /\bremove\b|\bdelete\b/i],
    ['询问原因', /\bwhy\b/i],
    ['指出冗余', /\bunnecessary\b|\bredundant\b|not needed/i],
    ['要求改用某 API', /\buse .* instead\b|\bprefer\b/i],
    ['询问是否有必要', /\bis .* necessary\b|\bneeded\b/i],
];

/**
 * Why a PR gets closed without merging. Merged PRs only show feedback that was successfully
 * addressed; this looks at the complementary signal.
 */
const CLOSURE_PATTERNS = [
    ['auto-closed-by-bot', /has been automatically closed|automatically closed|auto-clos/i],
    ['invalid-routes-block', /\bNOROUTE\b|routes.*(block|section)|无条件关闭/i],
    ['duplicate', /\bduplicate\b|\balready (exists|implemented)\b/i],
    ['stale-or-abandoned', /\bstale\b|no (activity|response)|inactive|abandoned/i],
    ['superseded', /\bsuperseded\b|\breplaced by\b|\bin favour of\b/i],
    ['author-withdrew', /\bclosing (this|it)\b|I'?ll close|close this myself/i],
    ['out-of-scope', /out of scope|not (related|relevant)|off-topic/i],
    ['site-unavailable', /\b(site|website|service) is (down|dead|gone|offline)\b|\bshut down\b/i],
    // Two automation families dominate the closed set and are easy to miss: an anti-slop
    // filter and a vouch / denylist check. Neither is about route quality.
    ['spam-or-low-quality', /low-quality|spam|anti-slop/i],
    ['author-blocked', /\bvouch\b|denounced|blocked in the vouch/i],
];

/**
 * Words that carry no signal for theme discovery — either too common, or present in
 * essentially every route PR by definition.
 */
const STOP_WORDS = new Set(
    `the a an and or but if then this that these those is are was were be been being to of in on at for with
     without from by as it its it's you your we our they their he she his her can could would should will shall
     may might must have has had do does did done please thanks thank hi hello ok okay yes no not nor so than
     too very just also only more most other another same such now new old here there when where what which who
     how why all any some each every both few many much own out up down over under again further once about
     into through between during before after above below off on upon pr prs pull request route routes rsshub
     file files code line lines change changes add added remove removed use used using make makes made need
     needs needed want wants get gets got go goes going see seen look looks like would like one two first last
     com http https www github master branch merge merged commit commits fix fixed issue issues note notes
     good better best bad wrong right correct incorrect instead should shouldn't don't doesn't isn't aren't
     let lets us me my i'm i've we're you're it'll that's there's isn't can't won't
     tonyrl proposed don img width height alt src furthermore provide provides provided
     official feeds feed rss unique value updated latest while due always already available
     lag behind internal content`
        .split(/\s+/)
        .filter(Boolean)
);

/**
 * Mine frequent terms from human comments so the theme list can be checked against the data
 * rather than guessed. CI posts whole RSS feeds as comments, so those are excluded upstream.
 */
function discoverTerms(humanComments, { ngrams = 2, top = 60 } = {}) {
    const uni = new Map();
    const bi = new Map();

    for (const c of humanComments) {
        const text = (c.body ?? '')
            .toLowerCase()
            .replaceAll(/`[^`]*`/g, ' ') // drop inline code
            .replaceAll(/https?:\/\/\S+/g, ' ')
            .replaceAll(/[^a-z]+/g, ' ');
        const words = text.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w));

        for (const w of words) {
            uni.set(w, (uni.get(w) ?? 0) + 1);
        }
        for (let i = 0; i < words.length - 1; i++) {
            const g = `${words[i]} ${words[i + 1]}`;
            bi.set(g, (bi.get(g) ?? 0) + 1);
        }
    }

    const rank = (m, min) => [...m.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, top);
    return { unigrams: rank(uni, 20), bigrams: rank(bi, 8) };
}

function main() {
    if (!existsSync(IN_FILE)) {
        throw new Error(`Missing ${IN_FILE}. Run "node tools/fetch-reviews.mjs --full" first.`);
    }

    const prs = JSON.parse(readFileSync(IN_FILE, 'utf8'));
    const all = [];
    for (const pr of prs) {
        for (const c of pr.comments) {
            all.push({ ...c, pr: pr.number, prTitle: pr.title });
        }
    }

    const autoReview = all.filter(isAutoReview);
    const bot = all.filter((c) => !isAutoReview(c) && isBot(c));
    const human = all.filter((c) => !isBot(c));

    // Merged vs closed-without-merge. Older corpora predate the `merged` field.
    const isMerged = (p) => p.merged ?? Boolean(p.mergedAt);
    const closedPrs = prs.filter((p) => !isMerged(p));
    const closedNumbers = new Set(closedPrs.map((p) => p.number));

    // Closure reasons: bot comments matter here, since automatic closing is done by a bot.
    const closureStats = new Map();
    for (const c of all) {
        if (!closedNumbers.has(c.pr)) {
            continue;
        }
        for (const [name, re] of CLOSURE_PATTERNS) {
            if (!re.test(c.body)) {
                continue;
            }
            const e = closureStats.get(name) ?? { name, count: 0, exemplars: [] };
            e.count += 1;
            if (e.exemplars.length < MAX_EXEMPLARS) {
                e.exemplars.push({ pr: c.pr, author: c.author, body: c.body.slice(0, 400) });
            }
            closureStats.set(name, e);
        }
    }
    const closures = [...closureStats.values()].sort((a, b) => b.count - a.count);

    const terms = discoverTerms(human);

    // --- Rule frequency (auto-review bot only; it is the only source of explicit rule numbers) ---
    const ruleStats = new Map();
    for (const c of autoReview) {
        const seen = new Set();
        for (const { id, label } of extractRules(c.body)) {
            seen.add(id);
            const entry = ruleStats.get(id) ?? { id, labels: new Map(), count: 0, exemplars: [] };
            if (label) {
                entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
            }
            ruleStats.set(id, entry);
        }
        // Count each rule once per comment.
        for (const id of seen) {
            const entry = ruleStats.get(id);
            entry.count += 1;
            if (entry.exemplars.length < MAX_EXEMPLARS) {
                entry.exemplars.push({ pr: c.pr, body: c.body.slice(0, EXEMPLAR_BODY_CHARS) });
            }
        }
    }

    // --- Human reviewer frequency ---
    const humanStats = new Map();
    for (const c of human) {
        const key = c.author ?? '(unknown)';
        humanStats.set(key, (humanStats.get(key) ?? 0) + 1);
    }

    // --- Theme frequency over human comments, with the authors who raise each theme ---
    const themeStats = new Map();
    for (const c of human) {
        for (const [name, re] of THEMES) {
            if (!re.test(c.body)) {
                continue;
            }
            const e = themeStats.get(name) ?? { name, count: 0, authors: new Map(), exemplars: [] };
            e.count += 1;
            e.authors.set(c.author ?? '(unknown)', (e.authors.get(c.author ?? '(unknown)') ?? 0) + 1);
            if (e.exemplars.length < MAX_EXEMPLARS) {
                e.exemplars.push({ pr: c.pr, author: c.author, body: c.body.slice(0, EXEMPLAR_BODY_CHARS) });
            }
            themeStats.set(name, e);
        }
    }

    const phrasingStats = new Map();
    for (const c of human) {
        for (const [name, re] of PHRASINGS) {
            if (!re.test(c.body)) {
                continue;
            }
            const e = phrasingStats.get(name) ?? { name, count: 0, exemplars: [] };
            e.count += 1;
            if (e.exemplars.length < MAX_EXEMPLARS) {
                e.exemplars.push({ pr: c.pr, author: c.author, body: c.body.slice(0, 300) });
            }
            phrasingStats.set(name, e);
        }
    }

    const byCount = (a, b) => b.count - a.count;
    const rules = [...ruleStats.values()].sort(byCount);
    const humans = [...humanStats.entries()].map(([author, count]) => ({ author, count })).sort(byCount);
    const themes = [...themeStats.values()].sort(byCount);
    const phrasings = [...phrasingStats.values()].sort(byCount);

    // --- Markdown report ---
    const L = [];
    L.push('# Review corpus analysis');
    L.push('');
    L.push(`- PRs: **${prs.length}** (merged ${prs.length - closedPrs.length} / closed without merge ${closedPrs.length})`);
    L.push(`- Comments: **${all.length}** (auto-review ${autoReview.length} / other bot ${bot.length} / human ${human.length})`);
    L.push(`- PRs with at least one human comment: **${new Set(human.map((c) => c.pr)).size}**`);
    L.push('');

    L.push('## Auto-review rule frequency');
    L.push('');
    L.push('| Rule | Count | Common label |');
    L.push('| --- | --- | --- |');
    for (const r of rules) {
        const top = [...r.labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        L.push(`| ${r.id} | ${r.count} | ${top} |`);
    }
    L.push('');

    L.push('## Top human reviewers');
    L.push('');
    L.push('| Author | Comments |');
    L.push('| --- | --- |');
    for (const h of humans.slice(0, 25)) {
        L.push(`| ${h.author} | ${h.count} |`);
    }
    L.push('');

    L.push('## Theme frequency (human comments)');
    L.push('');
    L.push('| Theme | Count | Top author |');
    L.push('| --- | --- | --- |');
    for (const t of themes) {
        const top = [...t.authors.entries()].sort((a, b) => b[1] - a[1])[0];
        L.push(`| ${t.name} | ${t.count} | ${top ? `${top[0]} (${top[1]})` : ''} |`);
    }
    L.push('');

    L.push(`## Why PRs are closed without merging (${closedPrs.length} PRs)`);
    L.push('');
    L.push('| Reason | Count |');
    L.push('| --- | --- |');
    for (const c of closures) {
        L.push(`| ${c.name} | ${c.count} |`);
    }
    L.push('');

    L.push('## Discovered terms (human comments)');
    L.push('');
    L.push('Mined from the corpus rather than hand-picked — use this to check the theme list for gaps.');
    L.push('');
    L.push('### Unigrams');
    L.push('');
    for (const [w, n] of terms.unigrams) {
        L.push(`- ${w} (${n})`);
    }
    L.push('');
    L.push('### Bigrams');
    L.push('');
    for (const [w, n] of terms.bigrams) {
        L.push(`- ${w} (${n})`);
    }
    L.push('');

    L.push('## Reviewer phrasing patterns (human comments)');
    L.push('');
    L.push('| Pattern | Count |');
    L.push('| --- | --- |');
    for (const p of phrasings) {
        L.push(`| ${p.name} | ${p.count} |`);
    }
    L.push('');

    L.push('## Exemplars by rule');
    L.push('');
    for (const r of rules) {
        L.push(`### ${r.id} — ${r.count}`);
        for (const [label, n] of [...r.labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
            L.push(`- label: ${label} (x${n})`);
        }
        for (const ex of r.exemplars) {
            L.push(`- PR #${ex.pr}: ${ex.body.replaceAll('\n', ' ').slice(0, 400)}`);
        }
        L.push('');
    }

    L.push('## Exemplars by theme');
    L.push('');
    for (const t of themes) {
        L.push(`### ${t.name} — ${t.count}`);
        for (const ex of t.exemplars) {
            L.push(`- PR #${ex.pr} by ${ex.author}: ${ex.body.replaceAll('\n', ' ').slice(0, 350)}`);
        }
        L.push('');
    }

    L.push('## Exemplars by phrasing');
    L.push('');
    for (const p of phrasings) {
        L.push(`### ${p.name} — ${p.count}`);
        for (const ex of p.exemplars) {
            L.push(`- PR #${ex.pr} by ${ex.author}: ${ex.body.replaceAll('\n', ' ').slice(0, 250)}`);
        }
        L.push('');
    }

    writeFileSync(join(DATA_DIR, 'analysis.md'), L.join('\n'));
    writeFileSync(
        join(DATA_DIR, 'analysis.json'),
        JSON.stringify(
            {
                totals: {
                    prs: prs.length,
                    merged: prs.length - closedPrs.length,
                    closedWithoutMerge: closedPrs.length,
                    comments: all.length,
                    autoReview: autoReview.length,
                    bot: bot.length,
                    human: human.length,
                },
                rules,
                humans,
                themes,
                phrasings,
                closures,
                terms,
            },
            null,
            2
        )
    );

    console.log(`PRs=${prs.length} (merged=${prs.length - closedPrs.length} closed=${closedPrs.length}) comments=${all.length} autoReview=${autoReview.length} bot=${bot.length} human=${human.length}`);
    console.log(`closures=${closures.map((c) => `${c.name}(${c.count})`).join(', ') || 'none'}`);
    console.log(`rules=${rules.length} top=${rules.slice(0, 8).map((r) => `${r.id}(${r.count})`).join(', ')}`);
    console.log(`reviewers=${humans.length} top=${humans.slice(0, 5).map((h) => `${h.author}(${h.count})`).join(', ')}`);
    console.log(`themes top=${themes.slice(0, 8).map((t) => `${t.name}(${t.count})`).join(', ')}`);
    console.log(`written: tools/data/analysis.md, tools/data/analysis.json`);
}

main();
