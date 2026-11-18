#!/usr/bin/env node
/** Render a *.calm-view.json sidecar: scoped JSON + static SVG diagram + Markdown prose.
 *
 * Usage: node render.js <view-file> [--out DIR] [--format all|json|svg|md]
 * Static, dependency-free SVG (lane layout owned by the renderer). No Mermaid (#3674).
 * The architecture file is only read, never modified.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, normalize, basename } from 'node:path';
import {
    ROOT,
    readJson,
    writeText,
    dumpJson,
    escXml,
    pyFloat0,
    endpoints,
    resolveView,
    type CalmArchitecture,
    type CalmFilter,
    type JsonRecord,
} from './calm.js';

const BOX_W = 200;
const BOX_H = 60;

/** Evidence pack header: what view, what model bytes, when, with which tool. */
export interface Attestation {
    view: string;
    model: string;
    modelSha256: string;
    generated: string;
    tool: string;
}

/** Render date: `SOURCE_DATE_EPOCH` (reproducible-builds standard) wins, else today. */
export function renderDate(): string {
    const epoch = Number(process.env.SOURCE_DATE_EPOCH ?? NaN);
    const when = Number.isFinite(epoch) ? new Date(epoch * 1000) : new Date();
    return when.toISOString().slice(0, 10);
}

export function attestation(viewPath: string, archPath: string): Attestation {
    const sha = createHash('sha256').update(readFileSync(archPath)).digest('hex');
    return {
        view: basename(viewPath),
        model: basename(archPath),
        modelSha256: sha,
        generated: renderDate(),
        tool: 'calm-views-tools@0.1.0',
    };
}

export function attestMarkdown(a: Attestation): string {
    return `\n\n---\n_Rendered ${a.generated} by ${a.tool} from ${a.model} sha256:${a.modelSha256.slice(0, 12)}._\n`;
}

export function attestSvg(svg: string, a: Attestation): string {
    return svg.replace(
        /<svg([^>]*)>/,
        `<svg$1>\n<!-- ${a.view} from ${a.model} sha256:${a.modelSha256.slice(0, 12)} ${a.generated} ${a.tool} -->`
    );
}
const GAP_X = 130;
const GAP_Y = 34;
const PAD = 18;
const COLORS = {
    box_fill: '#f8fafc',
    box_stroke: '#334155',
    actor_fill: '#eef2ff',
    db_fill: '#ecfdf5',
    edge: '#475569',
    label: '#0f172a',
    hull: '#94a3b8',
};

type FlowEdge = [string, string, JsonRecord];

/** Columns by longest-path depth from roots; cycle-guarded. */
export function laneLayout(inNodes: Set<string>, flowEdges: Array<[string, string]>): Map<string, [number, number]> {
    const preds = new Map<string, Set<string>>();
    for (const [s, d] of flowEdges) {
        if (inNodes.has(s) && inNodes.has(d) && s !== d) {
            if (!preds.has(d)) preds.set(d, new Set());
            preds.get(d)?.add(s);
        }
    }
    const depth = new Map<string, number>();
    const dep = (n: string, seen: Set<string>): number => {
        if (depth.has(n)) return depth.get(n) as number;
        if (seen.has(n)) return 0;
        const kids = [...(preds.get(n) ?? [])].filter((p) => !seen.has(p));
        const d = kids.length === 0 ? 0 : 1 + Math.max(...kids.map((p) => dep(p, new Set([...seen, n]))));
        depth.set(n, d);
        return d;
    };
    for (const n of inNodes) dep(n, new Set());
    const lanes = new Map<number, string[]>();
    for (const n of [...inNodes].sort()) {
        const k = depth.get(n) as number;
        if (!lanes.has(k)) lanes.set(k, []);
        lanes.get(k)?.push(n);
    }
    const cols = [...lanes.keys()].sort((a, b) => a - b).map((k) => lanes.get(k) as string[]);
    const tallest = Math.max(...cols.map((c) => c.length));
    const pos = new Map<string, [number, number]>();
    cols.forEach((col, ci) => {
        const top = ((tallest - col.length) * (BOX_H + GAP_Y)) / 2;
        col.forEach((n, ri) => {
            pos.set(n, [PAD + ci * (BOX_W + GAP_X), PAD + top + ri * (BOX_H + GAP_Y)]);
        });
    });
    return pos;
}

export function renderSvg(
    view: JsonRecord,
    arch: CalmArchitecture,
    inNodes: Set<string>,
    inRels: Set<string>,
    lifted: Map<string, string[]>
): string {
    const nodes = new Map<string, JsonRecord>();
    for (const n of arch.nodes ?? []) {
        if (inNodes.has(n['unique-id'] as string)) nodes.set(n['unique-id'] as string, n);
    }
    const relList = (arch.relationships ?? []).filter((r) => inRels.has(r['unique-id'] as string));
    const flowEdges: FlowEdge[] = [];
    const otherEdges: FlowEdge[] = [];
    const containers = new Map<string, Set<string>>();
    const seenPairs = new Set<string>();
    for (const r of relList) {
        const id = r['unique-id'] as string;
        const rt = (r['relationship-type'] as JsonRecord | undefined) ?? {};
        const eps = lifted.get(id) ?? [];
        if ('connects' in rt) {
            if (eps.length >= 2 && eps[0] !== eps[1]) {
                const key = `${eps[0]}>${eps[1]}`;
                if (!seenPairs.has(key)) {
                    seenPairs.add(key);
                    flowEdges.push([eps[0] as string, eps[1] as string, r]);
                }
            }
        } else if ('interacts' in rt) {
            const i = rt['interacts'] as { actor: string; nodes?: string[] };
            if (inNodes.has(i.actor)) {
                for (const m of new Set(eps.filter((e) => e !== i.actor))) {
                    if (inNodes.has(m)) otherEdges.push([i.actor, m, r]);
                }
            }
        } else if ('composed-of' in rt) {
            const co = rt['composed-of'] as { container: string; nodes?: string[] };
            if (inNodes.has(co.container)) {
                if (!containers.has(co.container)) containers.set(co.container, new Set());
                for (const m of co.nodes ?? []) {
                    if (inNodes.has(m)) containers.get(co.container)?.add(m);
                }
            }
        }
    }
    const pos = laneLayout(inNodes, flowEdges.map(([s, d]) => [s, d]));
    const maxX = Math.max(...[...pos.values()].map(([x]) => x)) + BOX_W + PAD;
    const maxY = Math.max(...[...pos.values()].map(([, y]) => y)) + BOX_H + PAD;
    const cx = (u: string): [number, number] => {
        const [x, y] = pos.get(u) as [number, number];
        return [x + BOX_W / 2, y + BOX_H / 2];
    };
    const P = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pyFloat0(maxX)} ${pyFloat0(maxY)}" ` +
            `width="${pyFloat0(maxX)}" height="${pyFloat0(maxY)}" font-family="sans-serif">`,
        `<title>${escXml((view['name'] as string) ?? (view['unique-id'] as string))}</title>`,
        '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" ' +
            `markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${COLORS.edge}" />` +
            '</marker></defs>',
        `<rect x="0" y="0" width="${pyFloat0(maxX)}" height="${pyFloat0(maxY)}" fill="white"/>`,
    ];
    for (const c of [...containers.keys()].sort()) {
        const members = [...(containers.get(c) as Set<string>)];
        const xs = [...members.map((m) => (pos.get(m) as [number, number])[0]), ...members.map((m) => (pos.get(m) as [number, number])[0] + BOX_W)];
        const ys = [...members.map((m) => (pos.get(m) as [number, number])[1]), ...members.map((m) => (pos.get(m) as [number, number])[1] + BOX_H)];
        const x0 = Math.min(...xs) - 14;
        const y0 = Math.min(...ys) - 30;
        P.push(
            `<rect x="${pyFloat0(x0)}" y="${pyFloat0(y0)}" width="${pyFloat0(Math.max(...xs) - Math.min(...xs) + 28)}" ` +
                `height="${pyFloat0(Math.max(...ys) - Math.min(...ys) + 44)}" fill="none" stroke="${COLORS.hull}" ` +
                'stroke-dasharray="8 5" stroke-width="1.5" rx="10"/>'
        );
        P.push(
            `<text x="${pyFloat0(x0 + 4)}" y="${pyFloat0(y0 + 16)}" font-size="12" fill="${COLORS.label}">` +
                `${escXml(c)}</text>`
        );
    }
    const edgePath = (x1: number, y1: number, x2: number, y2: number, dashed: boolean, label: string): string => {
        const style = dashed ? ' stroke-dasharray="6 4"' : '';
        let body: string;
        let lx: number;
        let ly: number;
        if (x2 > x1 + BOX_W / 2) {
            body = `<line x1="${pyFloat0(x1)}" y1="${pyFloat0(y1)}" x2="${pyFloat0(x2)}" y2="${pyFloat0(y2)}"`;
            lx = (x1 + x2) / 2;
            ly = (y1 + y2) / 2;
        } else {
            const mx = (x1 + x2) / 2;
            body = `<path d="M${pyFloat0(x1)},${pyFloat0(y1)} H${pyFloat0(mx)} V${pyFloat0(y2)} H${pyFloat0(x2)}" fill="none"`;
            lx = mx;
            ly = (y1 + y2) / 2;
        }
        let el = `${body} stroke="${COLORS.edge}" stroke-width="1.5"${style} marker-end="url(#arrow)"/>`;
        if (label) {
            el +=
                `<text x="${pyFloat0(lx)}" y="${pyFloat0(ly - 5)}" font-size="11" text-anchor="middle" ` +
                `fill="${COLORS.label}" stroke="white" stroke-width="3" paint-order="stroke">` +
                `${escXml(label)}</text>`;
        }
        return el;
    };
    for (const [s, d, r] of flowEdges) {
        if (!pos.has(s) || !pos.has(d)) continue;
        const [x1, y1] = cx(s);
        const [x2, y2] = cx(d);
        P.push(edgePath(x1 + BOX_W / 2, y1, x2 - BOX_W / 2, y2, false, (r['protocol'] as string) ?? ''));
    }
    for (const [s, d] of otherEdges) {
        if (!pos.has(s) || !pos.has(d)) continue;
        const [x1, y1] = cx(s);
        const [x2, y2] = cx(d);
        P.push(edgePath(x1 + BOX_W / 2, y1, x2 - BOX_W / 2, y2, true, 'interacts'));
    }
    for (const u of [...inNodes].sort()) {
        const [x, y] = pos.get(u) as [number, number];
        const t = ((nodes.get(u) as JsonRecord)['node-type'] as string) ?? '?';
        const fill = t === 'actor' ? COLORS.actor_fill : t === 'database' ? COLORS.db_fill : COLORS.box_fill;
        const rx = t === 'actor' ? 28 : 8;
        const drill = ((view['drill-down'] as Record<string, string> | undefined) ?? {})[u];
        if (drill) P.push(`<a href="${drill}.svg">`);
        P.push(
            `<rect x="${pyFloat0(x)}" y="${pyFloat0(y)}" width="${BOX_W}" height="${BOX_H}" rx="${rx}" ` +
                `fill="${fill}" stroke="${COLORS.box_stroke}" stroke-width="1.5"/>`
        );
        P.push(
            `<text x="${pyFloat0(x + BOX_W / 2)}" y="${pyFloat0(y + 25)}" font-size="12" text-anchor="middle" ` +
                `fill="${COLORS.label}">${escXml(u.slice(0, 28))}${drill ? ' ↧' : ''}</text>`
        );
        P.push(
            `<text x="${pyFloat0(x + BOX_W / 2)}" y="${pyFloat0(y + 42)}" font-size="10" text-anchor="middle" ` +
                `fill="${COLORS.edge}">${escXml(t.slice(0, 32))}</text>`
        );
        if (drill) P.push('</a>');
    }
    P.push('</svg>');
    return P.join('\n') + '\n';
}

export function renderMarkdown(
    view: JsonRecord,
    arch: CalmArchitecture,
    inNodes: Set<string>,
    inRels: Set<string>,
    excluded: Map<string, string[]>,
    viewDir: string,
    lifted: Map<string, string[]>,
    applied: Record<string, string[]> = {}
): string {
    const nodes = new Map((arch.nodes ?? []).map((n) => [n['unique-id'] as string, n]));
    const rels = new Map((arch.relationships ?? []).map((r) => [r['unique-id'] as string, r]));
    const appliedEntries = Object.entries(applied);
    const L = [
        `# ${(view['name'] as string) ?? (view['unique-id'] as string)}`,
        '',
        `_${(view['description'] as string) ?? ''}_`,
        '',
        `**Audience:** ${((view['audience'] as string[]) ?? []).join(', ')}  `,
        `**Source model:** \`${view['for'] as string}\` (unmodified)  `,
        `**Scope:** ${inNodes.size} nodes, ${inRels.size} relationships`,
        ...(appliedEntries.length > 0 ? [`**Applied filters:** ${appliedEntries.map(([k, v]) => `${k}=${v.join('|')}`).join(', ')}`] : []),
        '',
        '## Nodes',
        '',
        '| unique-id | type |',
        '|---|---|',
    ];
    const drillMap = ((view['drill-down'] as Record<string, string> | undefined) ?? {});
    for (const u of [...inNodes].sort()) {
        const cell = drillMap[u] ? `[\`${u}\`](${drillMap[u]}.md)` : `\`${u}\``;
        L.push(`| ${cell} | ${((nodes.get(u) as JsonRecord)['node-type'] as string) ?? '?'} |`);
    }
    L.push('', '## Relationships', '');
    for (const u of [...inRels].sort()) {
        const r = rels.get(u) as JsonRecord;
        const kind = Object.keys(((r['relationship-type'] as JsonRecord) ?? { '?': null }))[0];
        const proto = r['protocol'] ? ` (${r['protocol'] as string})` : '';
        const eps = [...(lifted.get(u) ?? [...endpoints(r)])].sort().map((e) => `\`${e}\``).join(', ');
        L.push(`- \`${u}\` — ${kind}${proto}: ${eps}`);
    }
    for (const d of ((view['filter'] as CalmFilter | undefined)?.decorators ?? []) as string[]) {
        const p = normalize(join(viewDir, `${d}.decorator.json`));
        if (existsSync(p)) {
            const dec = readJson(p) as JsonRecord;
            const data = (dec['data'] as JsonRecord | undefined) ?? {};
            L.push(
                '',
                `## Decorator: \`${d}\` (${(dec['type'] as string) ?? '?'})`,
                '',
                `Applies to: ${((dec['applies-to'] as string[]) ?? []).map((a) => `\`${a}\``).join(', ')}`,
                '',
                '```json',
                dumpJson(data),
                '```'
            );
        }
    }
    if (excluded.size > 0) {
        L.push('', '## Excluded (endpoints outside this view)', '');
        for (const u of [...excluded.keys()].sort()) {
            L.push(`- \`${u}\` — outside: ${(excluded.get(u) as string[]).map((e) => `\`${e}\``).join(', ')}`);
        }
    }
    L.push(
        '',
        '---',
        '_Rendered by the CALM Views POC (`tools/render.ts`). ' +
            'View semantics: listed + closure; dangling refs warn, never fail._',
        ''
    );
    return L.join('\n');
}

function parseArgs(argv: string[]): { view: string; out: string; format: string; set: Record<string, string[]> } {
    const args = argv.slice(2);
    if (args.length === 0 || args[0]?.startsWith('-')) {
        console.error('usage: node render.js <view-file> [--out DIR] [--format all|json|svg|md] [--set metadata.key=value,...]');
        process.exit(2);
    }
    let out = join(ROOT, 'renders');
    let format = 'all';
    const set: Record<string, string[]> = {};
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--out' && i + 1 < args.length) out = args[++i] as string;
        else if (args[i] === '--format' && i + 1 < args.length) format = args[++i] as string;
        else if (args[i] === '--set' && i + 1 < args.length) {
            for (const pair of (args[++i] as string).split(',')) {
                const at = pair.indexOf('=');
                if (at <= 0 || at === pair.length - 1) {
                    console.error(`invalid --set pair (want key=value): ${pair}`);
                    process.exit(2);
                }
                const key = pair.slice(0, at).replace(/^metadata\./, '');
                const values = pair.slice(at + 1).split('|').filter((v) => v !== '');
                if (values.length === 0) {
                    console.error(`invalid --set pair (empty value): ${pair}`);
                    process.exit(2);
                }
                set[key] = values;
            }
        } else {
            console.error(`unknown argument: ${args[i]}`);
            process.exit(2);
        }
    }
    if (!['all', 'json', 'svg', 'md'].includes(format)) {
        console.error(`invalid format: ${format}`);
        process.exit(2);
    }
    return { view: args[0] as string, out, format, set };
}

export function main(): void {
    const { view: viewPath, out, format, set } = parseArgs(process.argv);
    const view = readJson(viewPath) as JsonRecord;
    const viewDir = dirname(normalize(viewPath));
    const archPath = normalize(join(viewDir, view['for'] as string));
    const arch = readJson(archPath) as CalmArchitecture;
    const filt = { ...((view['filter'] as CalmFilter | undefined) ?? {}) } as CalmFilter & { metadata: Record<string, string[]> };
    filt.metadata = { ...(filt.metadata ?? {}), ...set };
    const { inNodes, inRels, excluded, liftedEndpoints } = resolveView(arch, filt);
    const attest = attestation(viewPath, archPath);
    const base = join(out, view['unique-id'] as string);
    const want = new Set(['all', format]);
    if (want.has('json') || want.has('all')) {
        const scopedNodes = (arch.nodes ?? []).filter((n) => inNodes.has(n['unique-id'] as string));
        const scopedRels = (arch.relationships ?? []).filter((r) => inRels.has(r['unique-id'] as string));
        const decs: unknown[] = [];
        for (const d of ((view['filter'] as CalmFilter | undefined)?.decorators ?? []) as string[]) {
            const p = normalize(join(viewDir, `${d}.decorator.json`));
            if (existsSync(p)) decs.push(readJson(p));
        }
        const scoped = {
            view: view['unique-id'],
            for: view['for'],
            nodes: scopedNodes,
            relationships: scopedRels,
            decorators: decs,
            attestation: attest,
        };
        writeText(base + '-scoped.json', dumpJson(scoped));
    }
    if (want.has('svg') || want.has('all')) {
        writeText(base + '.svg', attestSvg(renderSvg(view, arch, inNodes, inRels, liftedEndpoints), attest));
    }
    if (want.has('md') || want.has('all')) {
        writeText(base + '.md', renderMarkdown(view, arch, inNodes, inRels, excluded, viewDir, liftedEndpoints, set) + attestMarkdown(attest));
    }
    console.log(
        `${view['unique-id']}: ${inNodes.size} nodes, ${inRels.size} relationships -> ${base}.{json,svg,md}`
    );
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('/render.js') || invoked.endsWith('\\render.js')) {
    main();
}
