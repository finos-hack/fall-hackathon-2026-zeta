import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main as validateMain } from '../validate.js';

// Renders embed a date; pin it so committed renders match on any day.
process.env.SOURCE_DATE_EPOCH ??= '1794873600';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..');
const POC = join(HERE, '..', '..', '..');
const node = process.execPath;

const run = (script: string, args: string[]): { stdout: string; code: number } => {
    try {
        const stdout = execFileSync(node, [join(DIST, script), ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        return { stdout, code: 0 };
    } catch (e: unknown) {
        const err = e as { stdout?: string; status?: number };
        return { stdout: (err.stdout as string) ?? '', code: err.status ?? 1 };
    }
};

describe('end-to-end: validate -> render -> gallery are green and reproducible', () => {
    it('validate exits 0 with 16 OK lines', () => {
        const lines: string[] = [];
        const log = console.log;
        console.log = (line?: unknown) => lines.push(String(line ?? ''));
        let code: number;
        try {
            code = validateMain();
        } finally {
            console.log = log;
        }
        assert.equal(code, 0);
        const oks = lines.filter((line) => line.includes(': OK'));
        assert.equal(oks.length, 16, oks.join('\n'));
        assert.ok(oks.some((line) => line.includes('kyc-audit.calm-view.json: OK — 12 nodes, 14 relationships')));
        assert.ok(oks.some((line) => line.includes('multicloud-landing-zone/multicloud-region.calm-view.json: OK')));
    });

    // all-actors is multi-file (render.js is single-file) and calm-3-flows
    // is a tooling fixture: neither ships rendered output.
    // multicloud-environment and multicloud-layer carry no base filter;
    // they render with the same dimension the lens drills into.
    const RENDERABLE: Array<[string, string, ...string[]]> = [
        ['kyc-onboarding/kyc-platform', 'kyc-platform-view'],
        ['kyc-onboarding/kyc-integration', 'kyc-integration-view'],
        ['kyc-onboarding/kyc-audit', 'kyc-audit-view'],
        ['kyc-onboarding/kyc-screening-neighborhood', 'kyc-screening-neighborhood'],
        ['kyc-onboarding/kyc-platform-inside', 'kyc-platform-inside'],
        ['kyc-onboarding/kyc-audit-logging', 'kyc-audit-logging'],
        ['ech-0122/ech-business', 'ech-business'],
        ['ech-0122/ech-application', 'ech-application'],
        ['ech-0122/ech-capabilities', 'ech-capabilities'],
        ['multicloud-landing-zone/multicloud-global', 'multicloud-global'],
        ['multicloud-landing-zone/multicloud-cloud', 'multicloud-cloud'],
        ['multicloud-landing-zone/multicloud-region', 'multicloud-region'],
        ['multicloud-landing-zone/multicloud-environment', 'multicloud-environment', '--set', 'env=prod'],
        ['multicloud-landing-zone/multicloud-layer', 'multicloud-layer', '--set', 'layer=network'],
    ];

    it('render is deterministic: two fresh runs produce identical bytes', () => {
        const first = mkdtempSync(join(tmpdir(), 'calm-views-a-'));
        const second = mkdtempSync(join(tmpdir(), 'calm-views-b-'));
        for (const [v, outputId, ...extra] of RENDERABLE) {
            for (const tmp of [first, second]) {
                const { code } = run('render.js', [join(POC, 'views', `${v}.calm-view.json`), '--out', tmp, ...extra]);
                assert.equal(code, 0, v);
                const scoped = JSON.parse(readFileSync(join(tmp, `${outputId}-scoped.json`), 'utf8')) as { nodes: unknown[] };
                assert.ok(scoped.nodes.length > 0, `${v} renders no nodes`);
            }
        }
        for (const f of readdirSync(first)) {
            const a = readFileSync(join(first, f));
            const b = readFileSync(join(second, f));
            assert.ok(a.equals(b), `${f} differs`);
        }
    });

    it('gallery embeds the 14 rendered views', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'calm-views-'));
        for (const [v, , ...extra] of RENDERABLE) {
            const { code } = run('render.js', [join(POC, 'views', `${v}.calm-view.json`), '--out', tmp, ...extra]);
            assert.equal(code, 0, v);
        }
        const out = mkdtempSync(join(tmpdir(), 'calm-gallery-'));
        const { stdout, code } = run('gallery.js', ['--in', tmp, '--out', out]);
        assert.equal(code, 0);
        assert.match(stdout, /14 views embedded/);
        const html = readFileSync(join(out, 'gallery.html'), 'utf8');
        assert.equal((html.match(/<section>/g) ?? []).length, 14);
    });

    it('derive reproduces the frozen snapshot scope (4 nodes, 3 rels)', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'calm-derive-'));
        const out = join(tmp, 'probe.calm-view.json');
        const { stdout, code } = run('derive.js', [
            join(POC, 'model', 'fluxnova-kyc-onboarding.architecture.json'),
            'kyc-sanctions-screening-svc',
            '--depth', '1',
            '--id', 'probe',
            '--name', 'Probe',
            '--audience', 'risk-analysts',
            '--out', out,
        ]);
        assert.equal(code, 0);
        assert.match(stdout, /4 nodes, 3 relationships/);
        const v = JSON.parse(readFileSync(out, 'utf8')) as { filter: { nodes: unknown[]; relationships: unknown[] } };
        assert.equal(v.filter.nodes.length, 4);
        assert.equal(v.filter.relationships.length, 3);
    });
});
