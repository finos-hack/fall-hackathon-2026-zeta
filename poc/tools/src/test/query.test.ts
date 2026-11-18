import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadWorkspace } from '../query.js';

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
    it('skips malformed views and views with missing model files', () => {
        const root = mkdtempSync(join(tmpdir(), 'calm-query-workspace-'));
        const views = join(root, 'views');
        const models = join(root, 'model');
        mkdirSync(views, { recursive: true });
        mkdirSync(models, { recursive: true });
        writeFileSync(join(views, 'broken.calm-view.json'), '{ broken');
        writeFileSync(join(views, 'missing.calm-view.json'), JSON.stringify({
            'unique-id': 'missing', name: 'Missing', for: '../model/missing.architecture.json', filter: {},
        }));
        writeFileSync(join(views, 'good.calm-view.json'), JSON.stringify({
            'unique-id': 'good', name: 'Good', for: '../model/good.architecture.json', filter: { nodes: ['n'] },
        }));
        writeFileSync(join(models, 'good.architecture.json'), JSON.stringify({
            nodes: [{ 'unique-id': 'n', 'node-type': 'system' }], relationships: [],
        }));
        try {
            const workspace = loadWorkspace(root);
            assert.deepEqual(workspace.views.map((view) => view.uniqueId), ['good']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('views-for-node lists the views containing a node', () => {
        const { stdout, code } = run(['views-for-node', 'kyc-kyc-database']);
        assert.equal(code, 0);
        assert.match(stdout, /kyc-audit-view/);
    });

    it('views-for-node resolves nodes from non-KYC models', () => {
        const { stdout, code } = run(['views-for-node', 'ech-id-02472a07db1348cdbe6f1f91c8a5405b']);
        assert.equal(code, 0);
        assert.match(stdout, /ech-business/);
    });

    it('nodes-in-view lists the scoped nodes', () => {
        const { stdout, code } = run(['nodes-in-view', 'kyc-audit-view']);
        assert.equal(code, 0);
        assert.equal(stdout.trim().split('\n').length, 12);
    });

    it('describe-view reports audience, scope and exclusions with reason', () => {
        const { stdout, code } = run(['describe-view', 'kyc-audit-view']);
        assert.equal(code, 0);
        assert.match(stdout, /audience:/);
        assert.match(stdout, /model: model\/fluxnova-kyc-onboarding\.architecture\.json \(12\/20 nodes/);
        assert.match(stdout, /excluded:/);
        assert.match(stdout, /outside:/);
    });

    it('describe-view resolves each view against its own model', () => {
        const { stdout, code } = run(['describe-view', 'ech-business']);
        assert.equal(code, 0);
        assert.match(stdout, /model: model\/ech-0122\.architecture\.json \(100\/216 nodes/);
    });

    it('context resolves each view against its own model sha', () => {
        const { stdout, code } = run(['context', 'ech-business']);
        assert.equal(code, 0);
        assert.match(stdout, /model: model\/ech-0122\.architecture\.json sha256:[0-9a-f]{64}/);
        assert.match(stdout, /scope: 100\/216 nodes/);
    });

    it('coverage reports model-specific counts and uncovered nodes', () => {
        const { stdout, code } = run(['coverage']);
        assert.equal(code, 0);
        assert.match(stdout, /kyc-audit-view model\/fluxnova-kyc-onboarding\.architecture\.json 12\/20 nodes/);
        assert.match(stdout, /ech-business model\/ech-0122\.architecture\.json 100\/216 nodes/);
        assert.match(stdout, /multicloud-global model\/multicloud-landing-zone\.architecture\.json 18\/295 nodes/);
        assert.match(stdout, /uncovered \(\d+\):/);
    });

    it('coverage gate includes relationship control claims', () => {
        const { stdout, code } = run(['coverage', '--require', 'audit-logging', 'auditors']);
        assert.equal(code, 0);
        assert.match(stdout, /0 violation/);
    });

    it('lists uncovered relationship control claims', () => {
        const { stdout, code } = run(['coverage', '--require', 'encryption-in-transit', 'nobody']);
        assert.equal(code, 1);
        assert.match(stdout, /relationship model\/fluxnova-kyc-onboarding\.architecture\.json: relationship kyc-engine-to-process-db/);
    });

    it('coverage requires audit claims on both nodes and relationships', () => {
        const { stdout, code } = run(['coverage', '--require', 'audit-logging', 'auditors']);
        assert.equal(code, 0);
        assert.match(stdout, /0 violation/);
    });

    it('lists relationship control claims when an audience has no matching view', () => {
        const { stdout, code } = run(['coverage', '--require', 'encryption-in-transit', 'nobody']);
        assert.equal(code, 1);
        assert.match(stdout, /relationship model\/fluxnova-kyc-onboarding\.architecture\.json: relationship kyc-engine-to-process-db/);
    });

    it('context emits an LLM-ready bundle with model sha and exclusions', () => {
        const { stdout, code } = run(['context', 'kyc-audit-view']);
        assert.equal(code, 0);
        assert.match(stdout, /# view: kyc-audit-view/);
        assert.match(stdout, /model: .* sha256:[0-9a-f]{64}/);
        assert.match(stdout, /audience: compliance-officers, auditors/);
        assert.match(stdout, /scope: 12\/20 nodes/);
        assert.match(stdout, /## nodes/);
        assert.match(stdout, /kyc-kyc-database/);
        assert.match(stdout, /## relationships/);
        assert.match(stdout, /## excluded/);
        assert.match(stdout, /outside:/);
    });

    it('coverage --require passes when control nodes are in audience views', () => {
        const { stdout, code } = run(['coverage', '--require', 'data-classification', 'auditors']);
        assert.equal(code, 0);
        assert.match(stdout, /0 violation/);
    });

    it('coverage --require fails listing violators otherwise', () => {
        const { stdout, code } = run(['coverage', '--require', 'data-classification', 'nobody']);
        assert.equal(code, 1);
        assert.match(stdout, /3 violation/);
        assert.match(stdout, /kyc-kyc-database/);
    });

    it('unknown view exits 2', () => {
        const { code } = run(['describe-view', 'no-such-view']);
        assert.equal(code, 2);
    });
});
