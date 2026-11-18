import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createViewsServer } from '../server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POC = process.env.CALM_VIEWS_TEST_DIR ?? join(HERE, '..', '..', '..', '..');
const VIEWS = join(POC, 'views');
const KYC = JSON.parse(readFileSync(join(POC, 'model', 'fluxnova-kyc-onboarding.architecture.json'), 'utf8')) as Record<string, unknown>;
const ECH = JSON.parse(readFileSync(join(POC, 'model', 'ech-0122.architecture.json'), 'utf8')) as Record<string, unknown>;
const MULTICLOUD = JSON.parse(readFileSync(join(POC, 'model', 'multicloud-landing-zone.architecture.json'), 'utf8')) as Record<string, unknown>;

describe('views service export route', () => {
    it('serves SVG and PNG files for the graph returned by the lens', async () => {
        const server = createViewsServer({ viewsDir: VIEWS, exportBaseUrl: 'http://localhost:8095' });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const baseUrl = `http://127.0.0.1:${address.port}`;

        try {
            const lensResponse = await fetch(`${baseUrl}/lens/finos/architectures/12?version=1.0.0&view=kyc-audit-view`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: KYC }),
            });
            assert.equal(lensResponse.status, 200);
            const reply = (await lensResponse.json()) as {
                panels: { title: string; blocks: { type: string; items?: { label: string; href: string }[] }[] }[];
            };
            const exportBlock = reply.panels.find((panel) => panel.title === 'Export view')?.blocks[0];
            const svgLink = exportBlock?.items?.find((item) => item.label === 'Download SVG')?.href;
            const pngLink = exportBlock?.items?.find((item) => item.label === 'Download PNG')?.href;
            assert.ok(svgLink && pngLink);

            const svgResponse = await fetch(svgLink.replace('http://localhost:8095', baseUrl));
            assert.equal(svgResponse.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
            assert.match(svgResponse.headers.get('content-disposition') ?? '', /kyc-audit-view/);
            assert.match(await svgResponse.text(), /KYC Audit View/);

            const pngResponse = await fetch(pngLink.replace('http://localhost:8095', baseUrl));
            assert.equal(pngResponse.headers.get('content-type'), 'image/png');
            const png = Buffer.from(await pngResponse.arrayBuffer());
            assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

            const multiResponse = await fetch(`${baseUrl}/lens/finos/architectures/12?version=1.0.0&view=all-actors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: KYC }),
            });
            assert.equal(multiResponse.status, 200);
            const multiReply = (await multiResponse.json()) as {
                graph: { nodes: { id: string; calm: string[] }[] };
                panels: { title: string; blocks: { type: string; rows?: string[][] }[] }[];
            };
            const expectedActors = [KYC, ECH]
                .flatMap((architecture) => architecture.nodes as Record<string, unknown>[])
                .filter((node) => node['node-type'] === 'actor');
            assert.equal(multiReply.graph.nodes.length, expectedActors.length);
            assert.ok(multiReply.graph.nodes.some((node) => node.id.startsWith('ech-0122/')));
            assert.ok(multiReply.graph.nodes.every((node) => node.id.includes('/')));
            assert.ok(multiReply.graph.nodes.filter((node) => node.id.startsWith('ech-0122/')).every((node) => node.calm.length === 0));
            const metrics = multiReply.panels.find((panel) => panel.title === 'Selection')?.blocks.find((block) => block.type === 'table');
            assert.equal(metrics?.rows?.[0]?.[1], `${(KYC.nodes as unknown[]).length + (ECH.nodes as unknown[]).length} / ${expectedActors.length}`);

            const currentEch = structuredClone(ECH);
            const firstActor = (currentEch.nodes as Record<string, unknown>[]).find((node) => node['node-type'] === 'actor');
            assert.ok(firstActor);
            firstActor.name = 'Current Hub eCH actor';
            const echResponse = await fetch(`${baseUrl}/lens/finos/architectures/13?version=1.1.0&view=all-actors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: currentEch }),
            });
            assert.equal(echResponse.status, 200);
            const echReply = (await echResponse.json()) as { title: string; graph: { nodes: { label: string }[] } };
            assert.equal(echReply.title, 'All actors, both models');
            assert.ok(echReply.graph.nodes.some((node) => node.label === 'Current Hub eCH actor'));
            assert.equal(echReply.graph.nodes.length, expectedActors.length);
        } finally {
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
    });

    it('resolves the multi-cloud model and drills down from the canvas by stage', async () => {
        const server = createViewsServer({ viewsDir: VIEWS, exportBaseUrl: 'http://localhost:8095' });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const requestView = async (view: string, params: Record<string, string> = {}) => {
            const query = new URLSearchParams({ version: '1.0.0', view, ...params });
            const response = await fetch(`${baseUrl}/lens/finos/architectures/14?${query.toString()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document: MULTICLOUD }),
            });
            assert.equal(response.status, 200);
            return await response.json() as {
                title: string;
                graph: { nodes: { id: string; calm?: string[]; link?: { params?: Record<string, string> } }[] };
                controls: { param: string; items: { value: string }[] }[];
                panels: { title: string }[];
            };
        };

        try {
            const overview = await requestView('multicloud-global');
            assert.equal(overview.title, 'Multi-cloud overview');
            assert.equal(overview.controls.find((control) => control.param === 'view')?.items.length, 5);
            assert.deepEqual(overview.graph.nodes.find((node) => node.id === 'mlz-aws')?.link?.params, {
                view: 'multicloud-cloud', cloud: 'aws', regionGroup: 'all', env: 'all', layer: 'all',
            });
            assert.equal(overview.graph.nodes.find((node) => node.id === 'mlz-gcp')?.link?.params?.cloud, 'gcp');
            const gcpStagingFolder = overview.graph.nodes.find((node) => node.id === 'mlz-gcp-folder-stg');
            assert.deepEqual(gcpStagingFolder?.calm, ['mlz-gcp-folder-stg']);
            assert.deepEqual(gcpStagingFolder?.link?.params, {
                view: 'multicloud-cloud', cloud: 'gcp', regionGroup: 'all', env: 'all', layer: 'all',
            });
            assert.equal(overview.panels.some((panel) => panel.title === 'Drill-down'), false);

            const aws = await requestView('multicloud-cloud', { cloud: 'aws', regionGroup: 'all', env: 'all', layer: 'all' });
            assert.equal(aws.title, 'AWS');
            assert.deepEqual(aws.graph.nodes.find((node) => node.id === 'mlz-aws-region-us')?.link?.params, {
                view: 'multicloud-region', cloud: 'aws', regionGroup: 'us', env: 'all', layer: 'all',
            });

            const awsUs = await requestView('multicloud-region', { cloud: 'aws', regionGroup: 'us', env: 'all', layer: 'all' });
            const accountId = (MULTICLOUD.nodes as Record<string, unknown>[]).find((node) => {
                const metadata = node.metadata as Record<string, unknown>;
                return metadata.kind === 'account' && metadata.cloud === 'aws' && metadata['region-group'] === 'us' && metadata.env === 'prod';
            })?.['unique-id'];
            assert.equal(awsUs.title, 'US region group');
            assert.deepEqual(awsUs.graph.nodes.find((node) => node.id === accountId)?.link?.params, {
                view: 'multicloud-environment', cloud: 'aws', regionGroup: 'us', env: 'prod', layer: 'all',
            });

            const awsProd = await requestView('multicloud-environment', { cloud: 'aws', regionGroup: 'us', env: 'prod', layer: 'all' });
            const networkNode = (MULTICLOUD.nodes as Record<string, unknown>[]).find((node) => {
                const metadata = node.metadata as Record<string, unknown>;
                return metadata.cloud === 'aws' && metadata['region-group'] === 'us' && metadata.env === 'prod' && metadata.layer === 'network';
            })?.['unique-id'];
            assert.equal(awsProd.title, 'PROD environment');
            assert.deepEqual(awsProd.graph.nodes.find((node) => node.id === networkNode)?.link?.params, {
                view: 'multicloud-layer', cloud: 'aws', regionGroup: 'us', env: 'prod', layer: 'network',
            });

            const network = await requestView('multicloud-layer', { cloud: 'aws', regionGroup: 'us', env: 'prod', layer: 'network' });
            assert.ok(network.graph.nodes.length > 0);
            assert.equal(network.title, 'Network layer');
        } finally {
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
    });
});
