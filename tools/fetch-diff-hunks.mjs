#!/usr/bin/env node
/**
 * Pull the code under discussion for the most frequently raised rules.
 *
 * Review comments tell you *what* was wrong; the diff hunk shows the actual before/after.
 * Fetching hunks for the whole corpus would be wasteful, so this only targets the exemplar
 * PRs of the top rules already identified by analyze.mjs.
 *
 * Usage:
 *   node tools/fetch-diff-hunks.mjs [--rules 8] [--per-rule 3] [--max-per-pr 5]
 *
 * Output:
 *   tools/data/diff-hunks.json   pr, file path, comment body, diff hunk, associated rule
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OWNER = 'DIYgod';
const REPO = 'RSSHub';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? Number.parseInt(argv[i + 1], 10) : fallback;
};
const ruleLimit = argOf('rules', 8);
const perRule = argOf('per-rule', 3);
// One heavily-commented PR can otherwise supply most of the sample.
const maxPerPr = argOf('max-per-pr', 5);

const DATA_DIR = join(import.meta.dirname, 'data');
const ANALYSIS = join(DATA_DIR, 'analysis.json');

if (!existsSync(ANALYSIS)) {
    console.error('Missing analysis.json — run "node tools/analyze.mjs" first.');
    process.exit(1);
}

const { rules } = JSON.parse(readFileSync(ANALYSIS, 'utf8'));

// Map PR number -> which rules cite it.
// Each PR is used once, across all rules. Without that, a single heavily-commented PR can
// swamp the sample — an early run drew 23 of its 28 hunks from one PR.
const wanted = new Map();
for (const rule of rules.slice(0, ruleLimit)) {
    let taken = 0;
    for (const ex of rule.exemplars) {
        if (taken >= perRule) {
            break;
        }
        if (wanted.has(ex.pr)) {
            continue;
        }
        wanted.set(ex.pr, [rule.id]);
        taken += 1;
    }
}

console.log(`collecting hunks for ${wanted.size} PR(s) across ${Math.min(ruleLimit, rules.length)} rule(s)`);

const out = [];
for (const [pr, ruleIds] of wanted) {
    let comments;
    try {
        const raw = execFileSync('gh', ['api', `repos/${OWNER}/${REPO}/pulls/${pr}/comments?per_page=100`], {
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
        });
        comments = JSON.parse(raw);
    } catch (e) {
        console.error(`  PR #${pr}: ${e.message.split('\n')[0]}`);
        continue;
    }

    let kept = 0;
    for (const c of comments) {
        if (!c.diff_hunk || kept >= maxPerPr) {
            continue;
        }
        out.push({
            pr,
            rules: ruleIds,
            path: c.path ?? null,
            body: (c.body ?? '').slice(0, 600),
            diffHunk: c.diff_hunk.slice(0, 1500),
        });
        kept += 1;
    }
    console.log(`  PR #${pr}: ${comments.length} comment(s), ${kept} with hunks`);
}

writeFileSync(join(DATA_DIR, 'diff-hunks.json'), JSON.stringify(out, null, 2));
console.log(`\nwritten: tools/data/diff-hunks.json (${out.length} hunk(s))`);
