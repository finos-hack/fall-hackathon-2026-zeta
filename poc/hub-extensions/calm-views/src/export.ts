import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ELKPackage, { type ELK as ElkLayoutEngine, type ElkExtendedEdge, type ElkNode } from 'elkjs';
import sharp from 'sharp';
import type { LensReply } from './lens.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 256;
const BOX_WIDTH = 220;
const BOX_HEIGHT = 82;
const PADDING = 48;
const TITLE_HEIGHT = 58;
const EXPORT_CACHE_DIR = process.env.CALM_VIEWS_EXPORT_CACHE_DIR ?? join(tmpdir(), 'calm-views-exports');

type DiagramGraph = LensReply['graph'];
type CachedExport = { svg: string; fileName: string; namespace: string; createdAt: number; png?: Promise<Buffer> };
const exportsByToken = new Map<string, CachedExport>();
const ElkConstructor = ELKPackage as unknown as { new (): ElkLayoutEngine };
const elk = new ElkConstructor();

function escapeXml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] as string);
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'calm-view';
}

function nodeColor(tags: string[]): { fill: string; stroke: string } {
    const colors: Record<string, { fill: string; stroke: string }> = {
        actor: { fill: '#e8f4fd', stroke: '#24618b' },
        service: { fill: '#f0f7e8', stroke: '#547b32' },
        system: { fill: '#fff4e0', stroke: '#9a6b13' },
        database: { fill: '#f3e8fd', stroke: '#734a9a' },
    };
    return colors[tags.find((tag) => tag in colors) ?? ''] ?? { fill: '#f4f5f7', stroke: '#5c6470' };
}

function wrappedLabel(label: string, maxLength = 25): string[] {
    const words = label.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxLength && line) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines.slice(0, 2);
}

function layoutOptions(layout: LensReply['layout']): Record<string, string> {
    const algorithm = layout.algorithm === 'radial'
        ? 'org.eclipse.elk.radial'
        : layout.algorithm === 'tree'
            ? 'org.eclipse.elk.mrtree'
            : 'org.eclipse.elk.layered';
    const options: Record<string, string> = {
        'elk.algorithm': algorithm,
        'elk.spacing.nodeNode': '48',
        'elk.spacing.edgeNode': '20',
    };
    if (algorithm === 'org.eclipse.elk.layered') {
        options['elk.direction'] = layout.direction === 'down' ? 'DOWN' : 'RIGHT';
        options['elk.edgeRouting'] = 'ORTHOGONAL';
        options['elk.layered.spacing.nodeNodeBetweenLayers'] = '92';
        options['elk.layered.nodePlacement.strategy'] = 'NETWORK_SIMPLEX';
    }
    if (algorithm === 'org.eclipse.elk.mrtree') {
        options['elk.direction'] = 'DOWN';
        options['elk.edgeRouting'] = 'ORTHOGONAL';
    }
    return options;
}

function edgePath(sections: NonNullable<ElkExtendedEdge['sections']>): string {
    return sections.map((section) => {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
        return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x + PADDING} ${point.y + TITLE_HEIGHT}`).join(' ');
    }).join(' ');
}

function edgeLabelPosition(sections: NonNullable<ElkExtendedEdge['sections']>): { x: number; y: number } | undefined {
    const points = sections.flatMap((section) => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]);
    if (points.length < 2) return undefined;
    let longest = { length: -1, a: points[0]!, b: points[1]! };
    for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index]!;
        const b = points[index + 1]!;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length > longest.length) longest = { length, a, b };
    }
    return { x: (longest.a.x + longest.b.x) / 2 + PADDING, y: (longest.a.y + longest.b.y) / 2 + TITLE_HEIGHT - 5 };
}

/** Builds an SVG from the lens graph, using the selected layout and orthogonal edge routes. */
export async function renderGraphSvg(title: string, graph: DiagramGraph, layout: LensReply['layout']): Promise<string> {
    const input: ElkNode = {
        id: 'root',
        layoutOptions: layoutOptions(layout),
        children: graph.nodes.map((node) => ({ id: node.id, width: BOX_WIDTH, height: BOX_HEIGHT })),
        edges: graph.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    };
    const result = await elk.layout(input);
    const width = Math.ceil((result.width ?? 600) + PADDING * 2);
    const height = Math.ceil((result.height ?? 120) + PADDING * 2 + TITLE_HEIGHT);
    const positions = new Map<string, { x: number; y: number }>((result.children ?? []).map((node) => [node.id, {
        x: (node.x ?? 0) + PADDING,
        y: (node.y ?? 0) + TITLE_HEIGHT,
    }]));
    const layoutEdges = new Map<string, ElkExtendedEdge>((result.edges ?? []).map((edge) => [edge.id, edge]));

    const groups = graph.groups.map((group) => {
        const members = graph.nodes.filter((node) => node.group === group.id).map((node) => positions.get(node.id)).filter((point): point is { x: number; y: number } => point !== undefined);
        if (members.length === 0) return '';
        const x = Math.min(...members.map((point) => point.x)) - 18;
        const y = Math.min(...members.map((point) => point.y)) - 30;
        const right = Math.max(...members.map((point) => point.x + BOX_WIDTH)) + 18;
        const bottom = Math.max(...members.map((point) => point.y + BOX_HEIGHT)) + 18;
        return `<g><rect x="${x}" y="${y}" width="${right - x}" height="${bottom - y}" rx="14" fill="#eef2f6" stroke="#9aa5b1" stroke-dasharray="6 4"/><text x="${x + 12}" y="${y + 20}" class="group-label">${escapeXml(group.label)}</text></g>`;
    }).join('');

    const edges = graph.edges.map((edge) => {
        const laidOut = layoutEdges.get(edge.id);
        const sections = laidOut?.sections ?? [];
        if (sections.length === 0) return '';
        const labelPoint = edgeLabelPosition(sections);
        const label = escapeXml(edge.tags[0] ?? 'relationship');
        return `<g><path d="${edgePath(sections)}" fill="none" stroke="#667085" stroke-width="2" marker-end="url(#arrow)"/><text x="${labelPoint?.x ?? 0}" y="${labelPoint?.y ?? 0}" text-anchor="middle" class="edge-label">${label}</text></g>`;
    }).join('');

    const nodes = graph.nodes.map((node) => {
        const point = positions.get(node.id);
        if (!point) return '';
        const color = nodeColor(node.tags);
        const lines = wrappedLabel(node.label);
        const firstY = point.y + (lines.length === 1 ? 47 : 38);
        const text = lines.map((line, index) => `<tspan x="${point.x + BOX_WIDTH / 2}" dy="${index === 0 ? 0 : 18}">${escapeXml(line)}</tspan>`).join('');
        return `<g><rect x="${point.x}" y="${point.y}" width="${BOX_WIDTH}" height="${BOX_HEIGHT}" rx="12" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2"/><text x="${point.x + BOX_WIDTH / 2}" y="${firstY}" text-anchor="middle" class="node-label">${text}</text></g>`;
    }).join('');

    const empty = graph.nodes.length === 0 ? '<text x="48" y="108" class="node-label">No nodes in this view</text>' : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 0 0 L 10 4 L 0 8 z" fill="#667085"/></marker></defs><rect width="100%" height="100%" fill="#fff"/><style>text{font-family:Arial,sans-serif;fill:#202938}.title{font-size:22px;font-weight:700}.node-label{font-size:14px;font-weight:600}.edge-label{font-size:11px;fill:#475467;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.group-label{font-size:12px;font-weight:700;fill:#475467}</style><text x="${PADDING}" y="32" class="title">${escapeXml(title)}</text>${groups}${edges}${nodes}${empty}</svg>`;
}

function prune(now: number): void {
    for (const [token, entry] of exportsByToken) {
        if (now - entry.createdAt > CACHE_TTL_MS) exportsByToken.delete(token);
    }
    while (exportsByToken.size >= CACHE_LIMIT) {
        const oldest = exportsByToken.keys().next().value as string | undefined;
        if (!oldest) break;
        exportsByToken.delete(oldest);
    }
}

async function pruneFiles(now: number): Promise<void> {
    await mkdir(EXPORT_CACHE_DIR, { recursive: true });
    const files = (await readdir(EXPORT_CACHE_DIR)).filter((file) => /^[a-f0-9-]{36}\.json$/i.test(file));
    const entries: { path: string; createdAt: number }[] = [];
    for (const file of files) {
        const path = join(EXPORT_CACHE_DIR, file);
        try {
            const cached = JSON.parse(await readFile(path, 'utf8')) as { createdAt?: unknown };
            const createdAt = typeof cached.createdAt === 'number' ? cached.createdAt : 0;
            if (now - createdAt > CACHE_TTL_MS) await unlink(path);
            else entries.push({ path, createdAt });
        } catch {
            await unlink(path).catch(() => undefined);
        }
    }
    entries.sort((a, b) => b.createdAt - a.createdAt);
    await Promise.all(entries.slice(CACHE_LIMIT).map(({ path }) => unlink(path).catch(() => undefined)));
}

export async function cacheGraphExport(title: string, graph: DiagramGraph, namespace: string, layout: LensReply['layout']): Promise<string> {
    const now = Date.now();
    prune(now);
    const token = randomUUID();
    const entry: CachedExport = { svg: await renderGraphSvg(title, graph, layout), fileName: slug(title), namespace, createdAt: now };
    exportsByToken.set(token, entry);
    await pruneFiles(now);
    const destination = join(EXPORT_CACHE_DIR, `${token}.json`);
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
    await rename(temporary, destination);
    return token;
}

export async function getGraphExport(token: string, format: string, namespace: string): Promise<{ body: Buffer; contentType: string; fileName: string } | null> {
    let entry = exportsByToken.get(token);
    if (!entry) {
        try {
            entry = JSON.parse(await readFile(join(EXPORT_CACHE_DIR, `${token}.json`), 'utf8')) as CachedExport;
            exportsByToken.set(token, entry);
        } catch {
            return null;
        }
    }
    if (!entry || entry.namespace !== namespace || Date.now() - entry.createdAt > CACHE_TTL_MS) {
        exportsByToken.delete(token);
        await unlink(join(EXPORT_CACHE_DIR, `${token}.json`)).catch(() => undefined);
        return null;
    }
    if (format === 'svg') {
        return { body: Buffer.from(entry.svg, 'utf8'), contentType: 'image/svg+xml; charset=utf-8', fileName: `${entry.fileName}.svg` };
    }
    if (format !== 'png') return null;
    entry.png ??= sharp(Buffer.from(entry.svg)).png().toBuffer();
    return { body: await entry.png, contentType: 'image/png', fileName: `${entry.fileName}.png` };
}
