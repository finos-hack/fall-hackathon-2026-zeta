import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { packSidecar, unpackSidecar } from '../pack.js';
import type { JsonRecord } from '../calm.js';

describe('pack sidecar as Hub decorator and back (lossless)', () => {
    const view = {
        '$schema': '../schema/view.json',
        'unique-id': 'kyc-audit-view',
        name: 'KYC Audit View',
        description: 'Coverage?',
        audience: ['compliance-officers'],
        'suggested-formats': ['markdown'],
        'drill-down': { 'kyc-fluxnova-platform': 'kyc-platform-inside' },
        for: '../model/fluxnova-kyc-onboarding.architecture.json',
        filter: { nodes: ['a'], relationships: [] as string[] },
    } as unknown as JsonRecord;
    it('round-trips the full sidecar through the decorator envelope', () => {
        const arch = { nodes: [], relationships: [] } as unknown as {
            nodes: Record<string, unknown>[];
            relationships: Record<string, unknown>[];
        };
        const dec = packSidecar(view, arch, '/calm/namespaces/kyc-views/architectures/1/versions/1-0-0');
        assert.equal(dec['type'], 'view');
        assert.equal((dec['applies-to'] as string[]).length, 1);
        const back = unpackSidecar(dec);
        for (const k of ['unique-id', 'name', 'description', 'audience', 'suggested-formats', 'filter', 'drill-down']) {
            assert.deepEqual(back[k], view[k], k);
        }
    });
    it('unpack defaults the model reference', () => {
        const arch = { nodes: [], relationships: [] } as unknown as {
            nodes: Record<string, unknown>[];
            relationships: Record<string, unknown>[];
        };
        const dec = packSidecar(view, arch, 'x');
        const back = unpackSidecar(dec);
        assert.equal(back['for'], '../model/fluxnova-kyc-onboarding.architecture.json');
    });
});
