#!/usr/bin/env node
/** Answer reader-side queries over the model and its sidecar views.
 *
 * Reader layer (#2344 territory): these queries select, they never draw.
 * Designed to sit on CalmGraph when #3661 lands; the graph tools here are
 * a stopgap over the raw document. No server, no SQL.
 *
 * Usage: node query.js views-for-node NODE-ID
 *        node query.js nodes-in-view VIEW-ID
 *        node query.js describe-view VIEW-ID | context VIEW-ID
 *        node query.js coverage
 * `context` emits a compact, LLM-ready bundle: header (view, model sha,
 * audience, scope), nodes, relationships, exclusions with reason.
 *
 * VIEW-ID is the view `unique-id` (e.g. kyc-audit-view).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, normalize, basename, relative } from 'node:path';
import {
    ROOT,
    listViewFiles,
    namespaced,
    readJson,
    resolveMultiView,
    endpoints,
    type CalmArchitecture,
    type CalmFilter,
    type JsonRecord,
} from './calm.js';

interface LoadedView {
    uniqueId: string;
    name: string;
    description: string;
    audience: string[];
    group?: string;
    for: unknown;
    filter: CalmFilter;
    dir: string;
}

interface LoadedModel {
    views: LoadedView[];
}

export function loadWorkspace(root: string = ROOT): LoadedModel {
    const viewsDir = join(root, 'views');
    const views: LoadedView[] = [];
    for (const name of listViewFiles(viewsDir)) {
        const path = join(viewsDir, name);
        try {
            const v = readJson(path) as JsonRecord;
            const targets = Array.isArray(v['for']) ? v['for'] : [v['for']];
            if (typeof v['unique-id'] !== 'string' || typeof v['name'] !== 'string'
                || targets.length === 0 || !targets.every((target) => typeof target === 'string')
                || typeof v['filter'] !== 'object' || v['filter'] === null || Array.isArray(v['filter'])) {
                process.stderr.write(`skip invalid view ${name}: required fields are missing or invalid\n`);
                continue;
            }
            const dir = dirname(path);
            const missing = (targets as string[]).filter((target) => !existsSync(normalize(join(dir, target))));
            if (missing.length > 0) {
                process.stderr.write(`skip view ${name}: model target missing: ${missing.join(', ')}\n`);
                continue;
            }
            for (const target of targets as string[]) readJson(normalize(join(dir, target)));
            views.push({
                uniqueId: v['unique-id'] as string,
                name: v['name'] as string,
                description: (v['description'] as string) ?? '',
                audience: Array.isArray(v['audience']) ? v['audience'] as string[] : [],
                ...(typeof v['group'] === 'string' ? { group: v['group'] as string } : {}),
                for: v['for'],
                filter: v['filter'] as CalmFilter,
                dir,
            });
        } catch (error) {
            process.stderr.write(`skip invalid view ${name}: ${(error as Error).message}\n`);
        }
    }
    return { views };
}

function findView(views: LoadedView[], id: string): LoadedView {
    const v = views.find((x) => x.uniqueId === id);
    if (!v) {
        process.stderr.write(`unknown view: ${id}\n`);
        process.exit(2);
    }
    return v as LoadedView;
}

function nodeLabel(arch: CalmArchitecture, id: string): string {
    const n = (arch.nodes ?? []).find((x) => (x as JsonRecord)['unique-id'] === id) as JsonRecord | undefined;
    const name = (n?.['name'] as string) ?? '';
    const type = (n?.['node-type'] as string) ?? '?';
    return `${id} [${type}]${name ? ` ${name}` : ''}`;
}

export function viewsForNode({ views }: LoadedModel, nodeId: string): string[] {
    return views.filter((view) => resolveMultiView(view.dir, { for: view.for, filter: view.filter } as JsonRecord)
        .some((file) => file.resolution.inNodes.has(nodeId) || file.resolution.inNodes.has(namespaced(file.archPath, nodeId)))).map((v) => v.uniqueId);
}

export function cmdViewsForNode(m: LoadedModel, nodeId: string): string {
    return viewsForNode(m, nodeId).join('\n') + '\n';
}

export function cmdNodesInView(_m: LoadedModel, viewId: string): string {
    const v = findView(_m.views, viewId);
    const files = resolveMultiView(v.dir, { for: v.for, filter: v.filter } as JsonRecord);
    const parts: string[] = [];
    for (const f of files) {
        const rows = [...f.resolution.inNodes].sort().map((id) => nodeLabel(f.arch, id));
        if (files.length > 1) parts.push(`# ${basename(f.archPath)}`);
        parts.push(...rows);
    }
    return parts.join('\n') + '\n';
}

export function cmdDescribeView(_m: LoadedModel, viewId: string): string {
    const v = findView(_m.views, viewId);
    const files = resolveMultiView(v.dir, { for: v.for, filter: v.filter } as JsonRecord);
    const lines = [
        `${v.uniqueId}: ${v.name}`,
        `audience: ${v.audience.join(', ') || '(none)'}`,
        ...(v.group ? [`group: ${v.group}`] : []),
        ...(v.description ? [v.description] : []),
    ];
    for (const f of files) {
        const { inNodes, inRels, excluded } = f.resolution;
        const total = (f.arch.nodes ?? []).length;
        const totalR = (f.arch.relationships ?? []).length;
        lines.push(`model: ${relative(ROOT, f.archPath)} (${inNodes.size}/${total} nodes, ${inRels.size}/${totalR} relationships)`);
        if (excluded.size > 0 && files.length === 1) {
            lines.push('excluded:');
            for (const [id, outside] of [...excluded.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
                lines.push(`  - ${id} (outside: ${[...outside].sort().join(', ')})`);
            }
        }
    }
    return lines.join('\n') + '\n';
}

export function cmdContext(_m: LoadedModel, viewId: string): string {
    const v = findView(_m.views, viewId);
    const files = resolveMultiView(v.dir, { for: v.for, filter: v.filter } as JsonRecord);
    const lines = [
        `# view: ${v.uniqueId} (${v.name})`,
        `audience: ${v.audience.join(', ') || '(none)'}`,
        ...(v.group ? [`group: ${v.group}`] : []),
    ];
    for (const f of files) {
        const { inNodes, inRels, excluded } = f.resolution;
        const sha = createHash('sha256').update(readFileSync(f.archPath)).digest('hex');
        const relById = new Map(
            (f.arch.relationships ?? []).map((r) => [(r as JsonRecord)['unique-id'] as string, r as JsonRecord])
        );
        lines.push(`model: ${relative(ROOT, f.archPath)} sha256:${sha}`);
        lines.push(
            `scope: ${inNodes.size}/${(f.arch.nodes ?? []).length} nodes, ${inRels.size}/${(f.arch.relationships ?? []).length} relationships`
        );
        lines.push('## nodes');
        for (const id of [...inNodes].sort()) {
            lines.push(`- ${nodeLabel(f.arch, id)}`);
        }
        lines.push('## relationships');
        for (const id of [...inRels].sort()) {
            const r = relById.get(id) ?? {};
            const eps = [...endpoints(r)].sort().join(', ');
            const kind = Object.keys(
                ((r as JsonRecord)['relationship-type'] as JsonRecord | undefined) ?? { '?': null }
            )[0] as string;
            lines.push(`- ${id} [${kind}] ${eps}`);
        }
        if (excluded.size > 0) {
            lines.push('## excluded (endpoints outside this view)');
            for (const [id, outside] of [...excluded.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
                lines.push(`- ${id} (outside: ${[...outside].sort().join(', ')})`);
            }
        }
    }
    return lines.join('\n') + '\n';
}

function claimsControl(holder: JsonRecord, control: string): boolean {
    const claims = holder['controls'];
    if (Array.isArray(claims)) return claims.includes(control);
    return typeof claims === 'object' && claims !== null && control in (claims as JsonRecord);
}

function elementKey(modelPath: string, kind: 'node' | 'relationship', id: string): string {
    return `${normalize(modelPath)}#${kind}:${id}`;
}

function elementLabel(modelPath: string, kind: 'node' | 'relationship', id: string, arch: CalmArchitecture): string {
    if (kind === 'node') return `${relative(ROOT, modelPath)}: ${nodeLabel(arch, id)}`;
    return `${relative(ROOT, modelPath)}: relationship ${id}`;
}

export function cmdCoverageRequire(m: LoadedModel, control: string, audience: string): { ok: boolean; text: string } {
    const views = m.views.map((view) => ({
        view,
        files: resolveMultiView(view.dir, { for: view.for, filter: view.filter } as JsonRecord),
    }));
    const needed = new Map<string, { modelPath: string; kind: 'node' | 'relationship'; id: string; arch: CalmArchitecture }>();
    for (const { files } of views) {
        for (const file of files) {
            for (const node of file.arch.nodes ?? []) {
                const id = (node as JsonRecord)['unique-id'] as string;
                if (claimsControl(node as JsonRecord, control)) {
                    needed.set(elementKey(file.archPath, 'node', id), { modelPath: file.archPath, kind: 'node', id, arch: file.arch });
                }
            }
            for (const relationship of file.arch.relationships ?? []) {
                const id = (relationship as JsonRecord)['unique-id'] as string;
                if (claimsControl(relationship as JsonRecord, control)) {
                    needed.set(elementKey(file.archPath, 'relationship', id), { modelPath: file.archPath, kind: 'relationship', id, arch: file.arch });
                }
            }
        }
    }
    const covered = new Set<string>();
    for (const { view, files } of views) {
        if (!view.audience.includes(audience)) continue;
        for (const file of files) {
            for (const id of file.resolution.inNodes) covered.add(elementKey(file.archPath, 'node', id));
            for (const id of file.resolution.inRels) covered.add(elementKey(file.archPath, 'relationship', id));
        }
    }
    const missing = [...needed.entries()].filter(([key]) => !covered.has(key)).map(([, item]) => item)
        .sort((a, b) => elementLabel(a.modelPath, a.kind, a.id, a.arch).localeCompare(elementLabel(b.modelPath, b.kind, b.id, b.arch)));
    const head = `require ${control} in audience ${audience}: ${missing.length} violation(s)`;
    if (missing.length === 0) return { ok: true, text: head + '\n' };
    return { ok: false, text: head + '\n' + missing.map((item) => `- ${item.kind} ${elementLabel(item.modelPath, item.kind, item.id, item.arch)}`).join('\n') + '\n' };
}

export function cmdCoverage(m: LoadedModel): string {
    const views = m.views.map((view) => ({
        view,
        files: resolveMultiView(view.dir, { for: view.for, filter: view.filter } as JsonRecord),
    }));
    const coveredNodes = new Set<string>();
    const allModels = new Map<string, CalmArchitecture>();
    const lines: string[] = [];
    for (const { view, files } of views) {
        for (const file of files) {
            allModels.set(normalize(file.archPath), file.arch);
            for (const id of file.resolution.inNodes) coveredNodes.add(elementKey(file.archPath, 'node', id));
            lines.push(`${view.uniqueId} ${relative(ROOT, file.archPath)} ${file.resolution.inNodes.size}/${(file.arch.nodes ?? []).length} nodes, ${file.resolution.inRels.size}/${(file.arch.relationships ?? []).length} relationships`);
        }
    }
    const uncovered: string[] = [];
    for (const [modelPath, arch] of allModels) {
        for (const node of arch.nodes ?? []) {
            const id = (node as JsonRecord)['unique-id'] as string;
            if (!coveredNodes.has(elementKey(modelPath, 'node', id))) uncovered.push(`${relative(ROOT, modelPath)}: ${id}`);
        }
    }
    uncovered.sort();
    lines.push(`uncovered (${uncovered.length}): ${uncovered.join(', ') || '(none)'}`);
    return lines.join('\n') + '\n';
}

function usage(): never {
    process.stderr.write(
        'Usage: node query.js views-for-node NODE-ID | nodes-in-view VIEW-ID | describe-view VIEW-ID | context VIEW-ID | coverage\n',
    );
    process.exit(2);
}

function main(): void {
    const [cmd, arg, ...rest] = process.argv.slice(2);
    if (!cmd) usage();
    const m = loadWorkspace();
    let out: string;
    switch (cmd) {
        case 'views-for-node':
            if (!arg) usage();
            out = cmdViewsForNode(m, arg as string);
            break;
        case 'nodes-in-view':
            if (!arg) usage();
            out = cmdNodesInView(m, arg as string);
            break;
        case 'describe-view':
            if (!arg) usage();
            out = cmdDescribeView(m, arg as string);
            break;
        case 'context':
            if (!arg) usage();
            out = cmdContext(m, arg as string);
            break;
        case 'coverage':
            if (arg === '--require') {
                const [control, audience] = rest;
                if (!control || !audience) {
                    process.stderr.write('Usage: node query.js coverage --require CONTROL AUDIENCE\n');
                    process.exit(2);
                }
                const r = cmdCoverageRequire(m, control as string, audience as string);
                process.stdout.write(r.text);
                process.exit(r.ok ? 0 : 1);
            }
            out = cmdCoverage(m);
            break;
        default:
            usage();
    }
    process.stdout.write(out);
}

if (process.argv[1]?.endsWith('/query.js') || process.argv[1]?.endsWith('\\query.js')) main();
