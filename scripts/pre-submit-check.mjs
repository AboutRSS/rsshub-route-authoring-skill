#!/usr/bin/env node
/**
 * Static checks that catch the mechanical failures before the pre-commit hook does.
 *
 * Usage:
 *   node scripts/pre-submit-check.mjs lib/routes/<namespace>
 *   node scripts/pre-submit-check.mjs lib/routes/<namespace>/<route>.ts
 *   node scripts/pre-submit-check.mjs --title "feat(route): add example route"
 *
 * The path arguments are optional, so --title can be checked on its own right before the PR
 * is opened.
 *
 * Exit code 1 when any FAIL is reported. WARN items need a human decision — several of them
 * are only wrong when they lack evidence, which is exactly what scripts/verify-selectors.mjs
 * is for.
 */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Files that differ from HEAD. Upstream files checked out with core.autocrlf=true are CRLF
 * on disk through no fault of the contributor, so scanning the whole tree buries the report
 * in pre-existing findings.
 */
function gitChanged(files) {
    try {
        const root = execSync('git rev-parse --show-toplevel', { cwd: dirname(files[0]), encoding: 'utf8' }).trim();
        const out = execSync('git status --porcelain -uall', { cwd: root, encoding: 'utf8' });
        const changed = new Set(
            out
                .split('\n')
                .map((l) => l.slice(3).trim())
                .filter(Boolean)
                .filter((p) => !p.includes(' -> '))
                .map((p) => resolve(root, p))
        );
        return files.filter((f) => changed.has(resolve(f)));
    } catch {
        return files; // not a git repo — check everything
    }
}

const results = [];

function add(file, severity, message) {
    results.push({ file, severity, message });
}

/**
 * The check the PR bot runs (amannn/action-semantic-pull-request). RSSHub configures only
 * `ignoreLabels` and `wip`, so the action defaults apply: each type is matched as `^type$`
 * with no case-insensitive flag, and the header pattern requires a space after the colon.
 * Scope and subject case are deliberately not enforced, because RSSHub does not enforce them.
 */
const CONVENTIONAL_TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test'];

const argv = process.argv.slice(2);
const titleIndex = argv.indexOf('--title');
const title = titleIndex === -1 ? undefined : argv[titleIndex + 1];
const pathArgs = argv.filter((arg, i) => !(titleIndex !== -1 && i === titleIndex + 1) && !arg.startsWith('--'));

if (titleIndex !== -1 && (title === undefined || title.startsWith('--'))) {
    console.error('--title needs a value, e.g. --title "feat(route): add example route"');
    process.exit(2);
}

if (title !== undefined) {
    const parsed = /^([A-Za-z]+)(?:\(([^)]*)\))?!?: (.+)$/.exec(title);
    if (!parsed) {
        add('<title>', 'FAIL', `"${title}" is not <type>(<scope>): <subject> — a space is required after the colon`);
    } else {
        const [, type, scope] = parsed;
        if (!CONVENTIONAL_TYPES.includes(type)) {
            add(
                '<title>',
                'FAIL',
                `type "${type}" is rejected — types are matched case-sensitively, so it must be lower-case and one of: ${CONVENTIONAL_TYPES.join(', ')}. "Feat:" fails, "feat:" passes`
            );
        } else if (scope === undefined) {
            add('<title>', 'WARN', 'no scope — the convention for a new route is `feat(route): add <site> <what> route`');
        }
    }
}

function collect(target) {
    let st;
    try {
        st = statSync(target);
    } catch {
        add(target, 'FAIL', 'path does not exist');
        return [];
    }
    if (st.isFile()) {
        return [target];
    }
    return readdirSync(target).flatMap((entry) => {
        const p = join(target, entry);
        return statSync(p).isDirectory() ? collect(p) : [p];
    });
}

const allFiles = pathArgs.flatMap(collect).filter((f) => /\.(ts|tsx)$/.test(f));
const files = allFiles.length > 0 ? gitChanged(allFiles) : [];

if (files.length === 0 && title === undefined && results.length === 0) {
    console.log(`No changed TypeScript files (${allFiles.length} scanned, all unmodified vs HEAD).`);
    process.exit(0);
}
if (allFiles.length > 0 && files.length < allFiles.length) {
    console.log(`(scoped to ${files.length} of ${allFiles.length} file(s) that differ from HEAD)`);
    console.log('');
}

const allText = new Map();
for (const f of files) {
    allText.set(f, readFileSync(f, 'utf8'));
}

for (const [file, text] of allText) {
    const lines = text.split('\n');

    // --- Hard failures ---
    if (text.includes('\r\n')) {
        add(file, 'FAIL', 'CRLF line endings — the pre-commit hook requires LF');
    }
    if (text.charCodeAt(0) === 0xfeff) {
        add(file, 'FAIL', 'file starts with a UTF-8 BOM');
    }
    if (/dangerouslySetInnerHTML/.test(text)) {
        add(file, 'FAIL', 'dangerouslySetInnerHTML — use raw() from hono/html, or cheerio');
    }
    if (/['"]User-Agent['"]\s*:\s*['"](?!.*trueUA)Mozilla/.test(text)) {
        add(file, 'FAIL', 'hardcoded User-Agent — omit the header (RSSHub sends a randomised Chrome UA) or use config.trueUA');
    }
    if (/:page\?|pageSize|perPage\s*[:=]\s*\d/.test(text)) {
        add(file, 'FAIL', 'pagination parameter — a feed requests the first page only');
    }
    if (/pubDate:.*new Date\(\)/.test(text)) {
        add(file, 'FAIL', 'pubDate falls back to new Date() — that is a fake date, omit pubDate instead');
    }
    if (/import type \{[^}]*\bload\b[^}]*\}\s*from\s*'cheerio'/.test(text)) {
        add(file, 'FAIL', '`load` is a value but sits in an `import type` — split it or use an inline `type` modifier');
    }
    if (/async function handler\(ctx\)/.test(text)) {
        add(file, 'FAIL', 'handler parameter has no type — use `ctx: Context` or drop the parameter');
    }

    // --- Warnings that need a decision ---
    if (/\.first\(\)|\.last\(\)|\.eq\(0\)/.test(text)) {
        add(file, 'WARN', 'uses .first()/.last() — justify with a count, or remove');
    }
    if (/\.trim\(\)/.test(text)) {
        add(file, 'WARN', 'uses .trim() — justify with a count, or remove');
    }
    if (/\?\?\s*(''|null|undefined)/.test(text)) {
        add(file, 'WARN', 'nullish fallback — check whether a downstream default already handles it');
    }
    if (/async function handler\([^)]*\)\s*\{/.test(text) && !/\)\s*:\s*Promise<Data>/.test(text)) {
        add(file, 'WARN', 'handler has no `: Promise<Data>` return type — `language` will widen to string');
    }
    if (/categories:\s*\[[^\]]*,[^\]]*\]/.test(text)) {
        add(file, 'WARN', 'more than one category — pick exactly one');
    }
    if (!/maintainers:/.test(text) && !/namespace/.test(file)) {
        add(file, 'WARN', 'no maintainers field');
    }
    if (file.endsWith('.tsx') && !/</.test(text.replaceAll(/</g, '<'))) {
        add(file, 'WARN', '.tsx without JSX — rename to .ts');
    }
    if (file.endsWith('.ts') && /renderToString\(/.test(text)) {
        add(file, 'WARN', 'JSX rendering in a .ts file — rename to .tsx');
    }
    if (/\\n/.test(text) && /description/.test(text)) {
        add(file, 'WARN', 'literal \\n in a description — HTML renders it as a space, use <br>');
    }

    for (const [i, line] of lines.entries()) {
        const comment = line.match(/\/\/\s*(.*)$/)?.[1] ?? '';
        // Only flag prose that is actually written in CJK. Comments on Chinese sites routinely
        // quote CJK samples ("e.g. 2026年9月9日 …") while the sentence itself is English, so
        // require both a CJK run and an absence of Latin prose before reporting.
        const cjk = (comment.match(/[一-鿿]/g) ?? []).length;
        const latin = (comment.match(/[A-Za-z]/g) ?? []).length;
        if (cjk >= 4 && latin < 10) {
            add(file, 'WARN', `line ${i + 1}: comment is not in English — "${comment.slice(0, 40)}"`);
        }
    }
}

// --- Namespace-level checks ---
const dirs = [...new Set(files.map((f) => f.replace(/[/\\][^/\\]+$/, '')))];
for (const dir of dirs) {
    let entries = [];
    try {
        entries = readdirSync(dir);
    } catch {
        continue;
    }
    if (entries.includes('radar.ts')) {
        add(dir, 'FAIL', 'separate radar.ts — put rules in Route[\'radar\']');
    }
    if (entries.includes('README.md')) {
        add(dir, 'FAIL', 'separate README.md — put descriptions in Route[\'description\']');
    }
    if (!entries.includes('namespace.ts')) {
        add(dir, 'FAIL', 'no namespace.ts — the directory will not be registered as a namespace');
    }
}

// --- Report ---
const fails = results.filter((r) => r.severity === 'FAIL');
const warns = results.filter((r) => r.severity === 'WARN');

for (const r of [...fails, ...warns]) {
    console.log(`${r.severity.padEnd(4)} ${r.file}\n      ${r.message}`);
}

console.log('');
console.log(`${fails.length} failure(s), ${warns.length} warning(s)`);

process.exit(fails.length > 0 ? 1 : 0);
