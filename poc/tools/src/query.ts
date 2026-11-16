#!/usr/bin/env node
/** Answer reader-side queries over the model and its sidecar views.
 *
 * Reader layer (#2344 territory): these queries select, they never draw.
 * Designed to sit on CalmGraph when #3661 lands; the graph tools here are
 * a stopgap over the raw document. No server, no SQL.
 *
 * Usage: node query.js views-for-node NODE-ID
 *        node query.js nodes-in-view VIEW-ID
 *        node query.js describe-view VIEW-ID
 *        node query.js coverage
 *
 * VIEW-ID is the view `unique-id` (e.g. kyc-audit-view).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    ROOT,
    readJson,
    resolveView,
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
    filter: CalmFilter;
}

interface LoadedModel {
    arch: CalmArchitecture;
    views: LoadedView[];
}

export function loadWorkspace(root: string = ROOT): LoadedModel {
    const arch = readJson(join(root, 'model', 'fluxnova-kyc-onboarding.architecture.json')) as CalmArchitecture;
    const viewsDir = join(root, 'views');
    const views: LoadedView[] = [];
    for (const name of readdirSync(viewsDir).filter((f) => f.endsWith('.calm-view.json')).sort()) {
        const v = readJson(join(viewsDir, name)) as JsonRecord;
        views.push({
            uniqueId: v['unique-id'] as string,
            name: (v['name'] as string) ?? '',
            description: (v['description'] as string) ?? '',
            audience: (v['audience'] as string[]) ?? [],
            ...(typeof v['group'] === 'string' ? { group: v['group'] as string } : {}),
            filter: (v['filter'] as CalmFilter) ?? {},
        });
    }
    return { arch, views };
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

export function viewsForNode({ arch, views }: LoadedModel, nodeId: string): string[] {
    return views.filter((v) => resolveView(arch, v.filter).inNodes.has(nodeId)).map((v) => v.uniqueId);
}

export function cmdViewsForNode(m: LoadedModel, nodeId: string): string {
    return viewsForNode(m, nodeId).join('\n') + '\n';
}

export function cmdNodesInView(m: LoadedModel, viewId: string): string {
    const v = findView(m.views, viewId);
    const { inNodes } = resolveView(m.arch, v.filter);
    return [...inNodes].sort().map((id) => nodeLabel(m.arch, id)).join('\n') + '\n';
}

export function cmdDescribeView(m: LoadedModel, viewId: string): string {
    const v = findView(m.views, viewId);
    const { inNodes, inRels, excluded } = resolveView(m.arch, v.filter);
    const lines = [
        `${v.uniqueId}: ${v.name}`,
        `audience: ${v.audience.join(', ') || '(none)'}`,
        ...(v.group ? [`group: ${v.group}`] : []),
        ...(v.description ? [v.description] : []),
        `scope: ${inNodes.size}/${(m.arch.nodes ?? []).length} nodes, ${inRels.size}/${(m.arch.relationships ?? []).length} relationships`,
    ];
    if (excluded.size > 0) {
        lines.push('excluded:');
        for (const [id, outside] of [...excluded.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
            lines.push(`  - ${id} (outside: ${[...outside].sort().join(', ')})`);
        }
    }
    return lines.join('\n') + '\n';
}

export function cmdCoverage(m: LoadedModel): string {
    const total = (m.arch.nodes ?? []).length;
    const coveredBy = new Map<string, string[]>();
    const lines = m.views.map((v) => {
        const { inNodes } = resolveView(m.arch, v.filter);
        for (const id of inNodes) coveredBy.set(id, [...(coveredBy.get(id) ?? []), v.uniqueId]);
        return `${v.uniqueId} ${inNodes.size}/${total}`;
    });
    const uncovered = (m.arch.nodes ?? [])
        .map((n) => (n as JsonRecord)['unique-id'] as string)
        .filter((id) => !coveredBy.has(id))
        .sort();
    lines.push(`uncovered (${uncovered.length}): ${uncovered.join(', ') || '(none)'}`);
    return lines.join('\n') + '\n';
}

function usage(): never {
    process.stderr.write(
        'Usage: node query.js views-for-node NODE-ID | nodes-in-view VIEW-ID | describe-view VIEW-ID | coverage\n',
    );
    process.exit(2);
}

function main(): void {
    const [cmd, arg] = process.argv.slice(2);
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
        case 'coverage':
            out = cmdCoverage(m);
            break;
        default:
            usage();
    }
    process.stdout.write(out);
}

main();
