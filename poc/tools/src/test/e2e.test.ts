import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..');
const POC = join(HERE, '..', '..', '..');
const RENDERS = join(POC, 'renders');
const node = process.execPath;

const run = (script: string, args: string[]): { stdout: string; code: number } => {
    try {
        const stdout = execFileSync(node, [join(DIST, script), ...args], { encoding: 'utf8' });
        return { stdout, code: 0 };
    } catch (e: unknown) {
        const err = e as { stdout?: string; status?: number };
        return { stdout: (err.stdout as string) ?? '', code: err.status ?? 1 };
    }
};

describe('end-to-end: validate -> render -> gallery are green and reproducible', () => {
    it('validate exits 0 with 9 OK lines', () => {
        const { stdout, code } = run('validate.js', []);
        assert.equal(code, 0);
        const oks = stdout.split('\n').filter((l) => l.includes(': OK'));
        assert.equal(oks.length, 9);
        assert.match(oks.join('\n'), /kyc-audit\.calm-view\.json: OK — 15 nodes, 21 relationships/);
    });

    it('render into a fresh temp dir reproduces the committed renders byte-for-byte', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'calm-views-'));
        for (const v of [
            'kyc-platform',
            'kyc-integration',
            'kyc-audit',
            'kyc-screening-neighborhood',
            'kyc-platform-inside',
            'ech-business',
            'ech-application',
            'ech-capabilities',
        ]) {
            const { code } = run('render.js', [join(POC, 'views', `${v}.calm-view.json`), '--out', tmp]);
            assert.equal(code, 0, v);
        }
        const committed = readdirSync(RENDERS).filter((x) => x !== 'gallery.html');
        assert.ok(committed.length >= 15, `expected 15+ committed renders, got ${committed.length}`);
        for (const f of committed) {
            const a = readFileSync(join(RENDERS, f));
            const b = readFileSync(join(tmp, f));
            assert.ok(a.equals(b), `${f} differs`);
        }
    });

    it('gallery embeds the 8 views', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'calm-gallery-'));
        const { stdout, code } = run('gallery.js', ['--out', tmp]);
        assert.equal(code, 0);
        assert.match(stdout, /8 views embedded/);
        const html = readFileSync(join(tmp, 'gallery.html'), 'utf8');
        assert.equal((html.match(/<section>/g) ?? []).length, 8);
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
