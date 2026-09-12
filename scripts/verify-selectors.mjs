#!/usr/bin/env node
/**
 * Produce the numbers that justify (or kill) defensive selector code.
 *
 * Reviewers ask "could you show me an example of the page structure that X is needed?"
 * They are asking for evidence, and the only acceptable evidence is a count. This script
 * produces those counts from the real page.
 *
 * Usage:
 *   node scripts/verify-selectors.mjs --url <page> --item <selector> --field <selector>
 *        [--attr href] [--base https://example.com] [--encoding gbk] [--limit 5]
 *
 * Example:
 *   node scripts/verify-selectors.mjs \
 *     --url https://www.98zhibo.com/zuqiujijin/ --item '.list_body_bd li' \
 *     --field 'a' --attr href --base https://www.98zhibo.com --encoding gbk
 *
 * Exit code is 0 always — this is a measurement tool, not a gate.
 */

import iconv from 'iconv-lite';
import { load } from 'cheerio';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}

const url = args.get('url');
const itemSel = args.get('item');
const fieldSel = args.get('field');
const attr = args.get('attr') ?? null;
const base = args.get('base') ?? url;
const encoding = args.get('encoding') ?? 'utf8';
const limit = Number.parseInt(args.get('limit') ?? '5', 10);

if (!url || !itemSel || !fieldSel) {
    console.error('Required: --url --item --field');
    process.exit(1);
}

// The URL comes from the command line, so a prompt-injected agent could be steered at an
// internal address. Loopback stays allowed on purpose — verifying a local RSSHub dev server on
// localhost:1200 is a documented use — but cloud metadata endpoints are refused.
if (!/^https?:\/\//i.test(url)) {
    console.error('Only http(s) URLs are supported.');
    process.exit(1);
}
if (/^https?:\/\/(169\.254\.169\.254|100\.100\.100\.200|metadata\.google\.internal|metadata)/i.test(url)) {
    console.error('Refusing to fetch a cloud metadata address.');
    process.exit(1);
}

const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
if (!res.ok) {
    console.error(`HTTP ${res.status} for ${url}`);
    process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const html = encoding === 'utf8' ? buf.toString('utf8') : iconv.decode(buf, encoding);
const $ = load(html);

const items = $(itemSel).toArray();
console.log(`URL            : ${url}`);
console.log(`encoding       : ${encoding}`);
console.log(`item selector  : ${itemSel}  ->  ${items.length} item(s)`);
console.log(`field selector : ${fieldSel}${attr ? ` (attr=${attr})` : ' (text)'}`);
console.log('');

if (items.length === 0) {
    console.error('No items matched — the item selector is wrong or the page needs a browser.');
    process.exit(1);
}

// --- Does the field selector match more than one element per item? ---
const counts = items.map((el) => $(el).find(fieldSel).length);
const max = Math.max(...counts);
const multi = counts.filter((n) => n > 1).length;
const zero = counts.filter((n) => n === 0).length;

console.log('--- .first() / .last() justification');
console.log(`  matches per item : min=${Math.min(...counts)} max=${max}`);
console.log(`  items with 0     : ${zero}`);
console.log(`  items with >1    : ${multi} / ${items.length}`);
console.log(`  => ${multi > 0 ? `JUSTIFIED on ${multi} item(s)` : 'NOT justified — remove .first() / .last()'}`);
if (zero > 0) {
    console.log(`  !! ${zero} item(s) have no match — your selector is too narrow, or those rows are structurally different`);
}
console.log('');

// --- Is the text padded? ---
if (!attr) {
    const padded = items.filter((el) => {
        const t = $(el).find(fieldSel).first().text();
        return t !== t.trim();
    });
    console.log('--- .trim() justification');
    console.log(`  items where text !== text.trim() : ${padded.length} / ${items.length}`);
    console.log(`  => ${padded.length > 0 ? `JUSTIFIED on ${padded.length} item(s)` : 'NOT justified — remove .trim()'}`);
    for (const el of padded.slice(0, limit)) {
        console.log(`     sample: ${JSON.stringify($(el).find(fieldSel).first().text().slice(0, 60))}`);
    }
    console.log('');
    console.log('--- sample text');
    for (const el of items.slice(0, limit)) {
        console.log(`  ${JSON.stringify($(el).find(fieldSel).first().text().slice(0, 80))}`);
    }
    console.log('');
}

// --- Links: absolute and unique? ---
if (attr) {
    const raws = items.map((el) => $(el).find(fieldSel).first().attr(attr) ?? '');
    const abs = raws.map((h) => {
        try {
            return new URL(h, base).href;
        } catch {
            return null;
        }
    });

    console.log('--- .trim() justification');
    const padded = items.filter((el) => {
        const t = $(el).find(fieldSel).first().text();
        return t !== t.trim();
    });
    console.log(`  items where text !== text.trim() : ${padded.length} / ${items.length}`);
    console.log(`  => ${padded.length > 0 ? `JUSTIFIED on ${padded.length} item(s)` : 'NOT justified — remove .trim()'}`);
    console.log('');

    console.log('--- links');
    console.log(`  missing ${attr}    : ${raws.filter((h) => !h).length}`);
    console.log(`  already absolute: ${raws.filter((h) => /^[a-z][a-z\d+\-.]*:/i.test(h)).length} / ${items.length}`);
    console.log(`  resolvable      : ${abs.filter(Boolean).length} / ${items.length}`);
    const unique = new Set(abs.filter(Boolean));
    console.log(`  unique          : ${unique.size} / ${abs.filter(Boolean).length}`);
    if (unique.size !== abs.filter(Boolean).length) {
        console.log('  !! duplicate links — each item needs a unique link (it becomes the guid)');
    }
    console.log('');
    console.log('--- sample links');
    for (const h of [...unique].slice(0, limit)) {
        console.log(`  ${h}`);
    }
}
