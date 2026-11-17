import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..');
const node = process.execPath;

const run = (args: string[]): { stdout: string; code: number } => {
    try {
        const stdout = execFileSync(node, [join(DIST, 'query.js'), ...args], { encoding: 'utf8' });
        return { stdout: stdout as string, code: 0 };
    } catch (e: unknown) {
        const err = e as { stdout?: string; status?: number };
        return { stdout: (err.stdout as string) ?? '', code: err.status ?? 1 };
    }
};

describe('query: reader-side queries over the model and sidecars', () => {
    it('views-for-node lists the views containing a node', () => {
        const { stdout, code } = run(['views-for-node', 'kyc-kyc-database']);
        assert.equal(code, 0);
        assert.match(stdout, /kyc-audit-view/);
    });

    it('nodes-in-view lists the scoped nodes', () => {
        const { stdout, code } = run(['nodes-in-view', 'kyc-audit-view']);
        assert.equal(code, 0);
        assert.equal(stdout.trim().split('\n').length, 15);
    });

    it('describe-view reports audience, scope and exclusions with reason', () => {
        const { stdout, code } = run(['describe-view', 'kyc-audit-view']);
        assert.equal(code, 0);
        assert.match(stdout, /audience:/);
        assert.match(stdout, /scope: 15\/20 nodes/);
        assert.match(stdout, /excluded:/);
        assert.match(stdout, /outside:/);
    });

    it('coverage reports per-view counts and uncovered nodes', () => {
        const { stdout, code } = run(['coverage']);
        assert.equal(code, 0);
        assert.match(stdout, /kyc-audit-view 15\/20/);
        assert.match(stdout, /uncovered \(\d+\):/);
    });

    it('context emits an LLM-ready bundle with model sha and exclusions', () => {
        const { stdout, code } = run(['context', 'kyc-audit-view']);
        assert.equal(code, 0);
        assert.match(stdout, /# view: kyc-audit-view/);
        assert.match(stdout, /model: .* sha256:[0-9a-f]{64}/);
        assert.match(stdout, /audience: compliance-officers, auditors/);
        assert.match(stdout, /scope: 15\/20 nodes/);
        assert.match(stdout, /## nodes/);
        assert.match(stdout, /kyc-kyc-database/);
        assert.match(stdout, /## relationships/);
        assert.match(stdout, /## excluded/);
        assert.match(stdout, /outside:/);
    });

    it('unknown view exits 2', () => {
        const { code } = run(['describe-view', 'no-such-view']);
        assert.equal(code, 2);
    });
});
