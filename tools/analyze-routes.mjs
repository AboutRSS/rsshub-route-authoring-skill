#!/usr/bin/env node
/**
 * Measure what *accepted* routes actually look like.
 *
 * The review corpus tells us what gets flagged. This looks at the other side: the shape of
 * routes that were merged. It runs entirely on a local checkout — no API calls, no rate limit.
 *
 * Usage:
 *   node tools/analyze-routes.mjs <path-to-rsshub-checkout>
 *
 * Example:
 *   node tools/analyze-routes.mjs ../RSSHub
 *
 * Output:
 *   tools/data/routes-stats.md
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) {
    console.error('Usage: node tools/analyze-routes.mjs <path-to-rsshub-checkout>');
    process.exit(1);
}

const ROUTES_DIR = join(root, 'lib', 'routes');

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
            out.push(...walk(p));
        } else if (/\.tsx?$/.test(entry)) {
            out.push(p);
        }
    }
    return out;
}

const files = walk(ROUTES_DIR);
const namespaces = files.filter((f) => f.endsWith('namespace.ts'));
const routes = files.filter((f) => !f.endsWith('namespace.ts'));

const count = (re) => routes.filter((f) => re.test(readFileSync(f, 'utf8'))).length;
const pct = (n) => `${((n / routes.length) * 100).toFixed(1)}%`;

const PATTERNS = {
    'cache.tryGet': /cache\.tryGet/,
    radar: /radar:\s*\[/,
    maintainers: /maintainers:\s*\[/,
    'features block': /features:\s*\{/,
    'language field': /\blanguage:/,
    allowEmpty: /allowEmpty/,
    enclosure: /enclosure_url/,
    'import ofetch': /from '@\/utils\/ofetch'/,
    'import got': /from '@\/utils\/got'/,
    'import puppeteer': /from '@\/utils\/puppeteer'/,
    'import parseDate': /from '@\/utils\/parse-date'/,
    'import timezone': /from '@\/utils\/timezone'/,
    'import config': /from '@\/config'/,
    'new URL(': /new URL\(/,
    'renderToString': /renderToString/,
    'template literals with tags': /`<[a-z]+[^`]*>/i,
};

// Category distribution
const categories = new Map();
for (const f of routes) {
    const m = readFileSync(f, 'utf8').match(/categories:\s*\[\s*'([^']+)'/);
    if (m) {
        categories.set(m[1], (categories.get(m[1]) ?? 0) + 1);
    }
}

const tsx = routes.filter((f) => f.endsWith('.tsx')).length;
const stats = Object.fromEntries(Object.entries(PATTERNS).map(([k, re]) => [k, count(re)]));

const L = [];
L.push('# Accepted route statistics');
L.push('');
L.push(`Source: \`${ROUTES_DIR}\``);
L.push('');
L.push(`- Namespaces: **${namespaces.length}**`);
L.push(`- Route files: **${routes.length}** (${routes.length - tsx} \`.ts\` / ${tsx} \`.tsx\`, ${pct(tsx)} JSX)`);
L.push('');
L.push('## Feature usage');
L.push('');
L.push('| Pattern | Routes | Share |');
L.push('| --- | --- | --- |');
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    L.push(`| ${k} | ${v} | ${pct(v)} |`);
}
L.push('');
L.push('## Category distribution');
L.push('');
L.push('| Category | Routes | Share |');
L.push('| --- | --- | --- |');
for (const [k, v] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`| ${k} | ${v} | ${pct(v)} |`);
}

const md = L.join('\n');
writeFileSync(join(import.meta.dirname, 'data', 'routes-stats.md'), md);

console.log(`namespaces=${namespaces.length} routes=${routes.length} tsx=${tsx} (${pct(tsx)})`);
console.log(`categories=${categories.size}`);
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${k}: ${v} (${pct(v)})`);
}
console.log(`written: tools/data/routes-stats.md`);
