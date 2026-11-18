import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cacheGraphExport, getGraphExport, renderGraphSvg } from '../export.js';

const graph = {
    groups: [{ id: 'group:platform', label: 'Platform', tags: ['Box', 'container'] }],
    nodes: [
        { id: 'actor', label: 'Customer & user', tags: ['Box', 'actor'], calm: ['actor'] },
        { id: 'service', label: 'Onboarding service', tags: ['Box', 'service'], calm: ['service'], group: 'group:platform' },
    ],
    edges: [{ id: 'calls', source: 'actor', target: 'service', tags: ['connects'], calm: ['calls'] }],
};

describe('view image export', () => {
    it('uses the selected layout direction for the exported diagram', async () => {
        const right = await renderGraphSvg('KYC view', graph, { algorithm: 'layered', direction: 'right' });
        const down = await renderGraphSvg('KYC view', graph, { algorithm: 'layered', direction: 'down' });
        const tree = await renderGraphSvg('KYC view', graph, { algorithm: 'tree', direction: 'down' });
        const radial = await renderGraphSvg('KYC view', graph, { algorithm: 'radial' });
        const dimensions = (svg: string) => ({
            width: Number(svg.match(/width="(\d+)"/)?.[1]),
            height: Number(svg.match(/height="(\d+)"/)?.[1]),
        });
        assert.ok(dimensions(right).width > dimensions(right).height);
        assert.ok(dimensions(down).height > dimensions(down).width);
        assert.match(tree, /<svg/);
        assert.match(radial, /<svg/);
    });

    it('creates an SVG snapshot with escaped labels, nodes, and relationships', async () => {
        const svg = await renderGraphSvg('KYC <view>', graph, { algorithm: 'layered', direction: 'right' });
        assert.match(svg, /KYC &lt;view&gt;/);
        assert.match(svg, /Customer &amp; user/);
        assert.match(svg, /Platform/);
        assert.match(svg, /connects/);
        assert.match(svg, /<svg[^>]+viewBox=/);
        assert.match(svg, /marker-end=/);
        const routedEdges = [...svg.matchAll(/<path d="([^"]+)" fill="none"/g)].map((match) => match[1] as string);
        assert.ok(routedEdges.length > 0);
        for (const path of routedEdges) {
            const points = [...path.matchAll(/[ML]\s+([\d.]+)\s+([\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])] as const);
            for (let index = 1; index < points.length; index += 1) {
                assert.ok(points[index]?.[0] === points[index - 1]?.[0] || points[index]?.[1] === points[index - 1]?.[1]);
            }
        }
    });

    it('returns SVG and PNG downloads for a short-lived graph token', async () => {
        const token = await cacheGraphExport('KYC View', graph, 'finos', { algorithm: 'layered', direction: 'right' });
        const svg = await getGraphExport(token, 'svg', 'finos');
        assert.equal(svg?.contentType, 'image/svg+xml; charset=utf-8');
        assert.equal(svg?.fileName, 'kyc-view.svg');
        assert.match(svg?.body.toString('utf8') ?? '', /Customer &amp; user/);

        const png = await getGraphExport(token, 'png', 'finos');
        assert.equal(png?.contentType, 'image/png');
        assert.equal(png?.fileName, 'kyc-view.png');
        assert.deepEqual(png?.body.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    });

    it('rejects unknown formats, namespaces, and tokens', async () => {
        const token = await cacheGraphExport('KYC View', graph, 'finos', { algorithm: 'layered', direction: 'right' });
        assert.equal(await getGraphExport(token, 'jpg', 'finos'), null);
        assert.equal(await getGraphExport(token, 'svg', 'another-namespace'), null);
        assert.equal(await getGraphExport('00000000-0000-0000-0000-000000000000', 'svg', 'finos'), null);
    });
});
