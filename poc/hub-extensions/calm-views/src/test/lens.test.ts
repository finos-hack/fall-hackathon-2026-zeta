import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadViews, viewsLensReply } from '../lens.js';
import { Problem } from '../problem.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// Test sidecars live in this repo under poc/.
const POC = process.env.CALM_VIEWS_TEST_DIR ?? join(HERE, '..', '..', '..', '..');
const VIEWS = join(POC, 'views');
const KYC = JSON.parse(readFileSync(join(POC, 'model', 'fluxnova-kyc-onboarding.architecture.json'), 'utf8')) as Record<string, unknown>;
const KYC_ID = 'fluxnova-kyc-onboarding.architecture.json';

let views: ReturnType<typeof loadViews> = [];

describe('calm-views lens', () => {
    before(() => {
        views = loadViews(VIEWS);
        assert.ok(views.length >= 6, `${views.length} sidecars`);
    });

    it('selects the named view over the sent document', () => {
        const reply = viewsLensReply(KYC, views, 'kyc-audit-view', KYC_ID);
        assert.equal(reply.graph.nodes.length, 12);
        assert.ok(reply.graph.edges.length > 0);
        assert.ok(reply.controls[0]?.items.some((i) => i.value === 'kyc-audit-view'));
    });

    it('defaults to the first matching view without a selection', () => {
        const reply = viewsLensReply(KYC, views, null, KYC_ID);
        assert.ok(reply.graph.nodes.length > 0);
    });

    it('shows model and view counts and links drill-down nodes to the next view', () => {
        const reply = viewsLensReply(KYC, views, 'kyc-audit-view', KYC_ID);
        const selection = reply.panels.find((p) => p.title === 'Selection');
        const metrics = selection?.blocks.find((block) => block.type === 'table') as
            | { rows?: string[][] }
            | undefined;
        assert.deepEqual(metrics?.rows?.slice(0, 2), [
            ['Nodes', `${(KYC.nodes as unknown[]).length} / ${reply.graph.nodes.length}`],
            ['Relationships', `${(KYC.relationships as unknown[]).length} / ${reply.graph.edges.length}`],
        ]);
        assert.match(metrics?.rows?.[2]?.[1] ?? '', /actor \d+\/\d+/);
        assert.ok(metrics?.rows?.[3]?.[1]);
        const definition = reply.panels.find((p) => p.title === 'View definition');
        const definitionText = JSON.stringify(definition?.blocks ?? []);
        assert.ok(definitionText.includes('kyc-audit-view') && definitionText.includes('```json'));
        const drillNode = reply.graph.nodes.find((node) => node.id === 'kyc-fluxnova-platform');
        assert.deepEqual(drillNode?.link, { params: { view: 'kyc-platform-inside' } });
        assert.equal(reply.panels.some((panel) => panel.title === 'Drill-down'), false);
        const excl = reply.panels.find((p) => p.title === 'Excluded with reason');
        assert.ok(excl, 'excluded panel present');
        const rows = (excl?.blocks[0] as { rows?: string[][] } | undefined)?.rows ?? [];
        assert.ok(rows.length > 0 && (rows[0]?.[1] ?? '').length > 0, 'exclusion names its outside reason');
    });

    it('falls back to the first view of the architecture for a view it does not define, and says so', () => {
        const reply = viewsLensReply(KYC, views, 'no-such-view', KYC_ID);
        const text = JSON.stringify(reply.panels);
        assert.ok(text.includes("'no-such-view' is not defined"));
        assert.equal(reply.controls.find((c) => c.param === 'view')?.value, reply.controls.find((c) => c.param === 'view')?.items[0]?.value);
    });

    it('answers 404 problem+json for foreign documents', () => {
        assert.throws(() => viewsLensReply(KYC, views, null, 'other-model.architecture.json'), (e: unknown) => e instanceof Problem && (e as Problem).status === 404);
    });

});
