#!/usr/bin/env node
/**
 * Check that every number cited in the references is traceable.
 *
 * Guesswork is the failure mode this repository keeps hitting: a rule number gets invented, a
 * label gets attached to the wrong number, a frequency gets asserted without being measured.
 * This script cannot catch prose that is simply wrong, but it catches the two kinds of claim
 * that *can* be checked mechanically — rule IDs and counts.
 *
 * It verifies that:
 *   - every `Rule N` is within the authoritative list or explicitly registered as unmatched
 *   - every `AGENTS #N` / `AGENTS.md #N` is within AGENTS.md's range
 *   - every "N mentions" figure appears as a real count in analysis.json
 *
 * Usage:
 *   node tools/verify-claims.mjs
 *
 * Exit code 1 if any claim cannot be traced.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(import.meta.dirname, 'data');
const ANALYSIS = join(DATA_DIR, 'analysis.json');

// .github/prompts/pr_review_rules.md currently holds 26 rules.
const AUTHORITATIVE_RULES = 26;
// AGENTS.md currently holds 49 numbered rules.
const AGENTS_RULES = 49;
// Numbers observed in review comments that match neither file, listed with their closest
// AGENTS.md counterpart in references/anti-patterns.md. Keep the two in sync by hand.
const REGISTERED_UNMATCHED = new Set([28, 29, 30, 32, 34, 36, 40, 42, 43, 44, 48, 50, 53, 54]);

const DOCS = ['references/anti-patterns.md', 'references/review-response.md', 'references/pr-template.md', 'references/examples.md', 'SKILL.md', 'README.md', 'CONTRIBUTING.md'];

const problems = [];
const checked = { rules: 0, agents: 0, counts: 0 };

// Every count that actually occurs in the corpus, so a figure can be checked against it.
const knownCounts = new Set();
if (existsSync(ANALYSIS)) {
    const a = JSON.parse(readFileSync(ANALYSIS, 'utf8'));
    for (const group of [a.rules ?? [], a.humans ?? [], a.themes ?? [], a.phrasings ?? [], a.closures ?? []]) {
        for (const entry of group) {
            knownCounts.add(entry.count);
        }
    }
} else {
    problems.push('analysis.json missing — counts cannot be checked (run: node tools/analyze.mjs)');
}

for (const doc of DOCS) {
    if (!existsSync(doc)) {
        continue;
    }
    const text = readFileSync(doc, 'utf8');

    for (const m of text.matchAll(/\bRule\s*(\d+)\b/g)) {
        checked.rules += 1;
        const n = Number.parseInt(m[1], 10);
        if (n >= 1 && n <= AUTHORITATIVE_RULES) {
            continue;
        }
        if (REGISTERED_UNMATCHED.has(n)) {
            continue;
        }
        problems.push(`${doc}: \`Rule ${n}\` is neither in the authoritative 1-${AUTHORITATIVE_RULES} nor registered as unmatched`);
    }

    for (const m of text.matchAll(/\bAGENTS(?:\.md)?\s*#?\s*(\d+)\b/g)) {
        checked.agents += 1;
        const n = Number.parseInt(m[1], 10);
        if (n < 1 || n > AGENTS_RULES) {
            problems.push(`${doc}: \`AGENTS #${n}\` is outside AGENTS.md's 1-${AGENTS_RULES}`);
        }
    }

    for (const m of text.matchAll(/(\d+)\s+mentions?/g)) {
        checked.counts += 1;
        const n = Number.parseInt(m[1], 10);
        if (knownCounts.size > 0 && !knownCounts.has(n)) {
            problems.push(`${doc}: "${n} mentions" does not match any count in analysis.json`);
        }
    }
}

console.log(`checked: ${checked.rules} rule id(s), ${checked.agents} AGENTS id(s), ${checked.counts} count claim(s)`);

if (problems.length === 0) {
    console.log('OK — every cited number is traceable');
    process.exit(0);
}

console.log('');
for (const p of problems) {
    console.log(`  ${p}`);
}
console.log('');
console.log(`${problems.length} problem(s)`);
process.exit(1);
