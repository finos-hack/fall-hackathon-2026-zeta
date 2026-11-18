import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pocScreen } from '../poc.js';
import { createViewsServer } from '../server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POC = process.env.CALM_VIEWS_TEST_DIR ?? join(HERE, '..', '..', '..', '..');
const VIEWS = join(POC, 'views');

describe('in-Hub POC presentation', () => {
    it('returns one markdown document with live model counts and Hub links', () => {
        const reply = pocScreen(VIEWS);
        assert.equal(reply.hubApi, 0);
        assert.match(reply.title, /CALM views/);
        assert.equal(reply.blocks.length, 1);
        const text = (reply.blocks[0] as { text?: string }).text ?? '';
        assert.match(text, /\| Model \| Origin \| Nodes \| Relationships \| Model file \| Source \| Commit \| License \| Importer \|/);
        assert.match(text, /\| \[FluxNova KYC onboarding\]\(http:\/\/localhost:8080\/#\/finos\/architectures\/12\/1\.0\.0\) \| Native CALM \| 20 \| 28 \|/);
        assert.match(text, /\| \[eCH-0122\]\(http:\/\/localhost:8080\/#\/finos\/architectures\/13\/1\.1\.0\) \| Imported from ArchiMate \| 216 \| 287 \|/);
        assert.match(text, /\| \[Multi-cloud landing zone\]\(http:\/\/localhost:8080\/#\/finos\/architectures\/14\/1\.0\.0\) \| Imported from Terragrunt \| 295 \| 450 \|/);
        assert.match(text, /\| View \| Question it answers \| Reader \|/);
        assert.ok(!reply.blocks.some((block) => block.type === 'cards'));
        assert.ok(!reply.blocks.some((block) => block.type === 'table'));
        assert.ok(!reply.blocks.some((block) => block.type === 'keyValue'));
        assert.ok(!reply.blocks.some((block) => block.type === 'stats'));
    });

    it('serves the screen at GET /poc', async () => {
        const server = createViewsServer({ viewsDir: VIEWS });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        try {
            const response = await fetch(`http://127.0.0.1:${address.port}/poc`);
            assert.equal(response.status, 200);
            const reply = (await response.json()) as { hubApi: number; blocks: { type: string; text?: string }[] };
            assert.equal(reply.hubApi, 0);
            assert.equal(reply.blocks.length, 1);
            assert.equal(reply.blocks[0]?.type, 'markdown');
            assert.match(reply.blocks[0]?.text ?? '', /## Three models/);
        } finally {
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
    });

    it('honours explicit links and hub base URL overrides', () => {
        const reply = pocScreen(VIEWS, {
            modelPath: join(POC, 'model', 'multicloud-landing-zone.architecture.json'),
            hubBaseUrl: 'https://hub.example',
            links: { namespace: 'demo', architectureId: 'landing-zone', architectureVersion: '2.0.0' },
        });
        const text = (reply.blocks[0] as { text?: string }).text ?? '';
        assert.match(text, /https:\/\/hub\.example\/#\/demo\/architectures\/landing-zone\/2\.0\.0/);
    });
});
