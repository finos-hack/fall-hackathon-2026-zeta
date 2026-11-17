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
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, normalize, basename, relative } from 'node:path';
import {
    ROOT,
    readJson,
    resolveView,
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
    /** Default architecture (KYC): single-model queries answer here. */
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
            for: v['for'],
            filter: (v['filter'] as CalmFilter) ?? {},
            dir: viewsDir,
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

export function cmdCoverageRequire(m: LoadedModel, control: string, audience: string): { ok: boolean; text: string } {
    const need = new Set(
        (m.arch.nodes ?? [])
            .filter((n) => control in (((n as JsonRecord)['controls'] as JsonRecord | undefined) ?? {}))
            .map((n) => (n as JsonRecord)['unique-id'] as string)
    );
    const covered = new Set<string>();
    for (const v of m.views) {
        if (!v.audience.includes(audience)) continue;
        for (const id of resolveView(m.arch, v.filter).inNodes) covered.add(id);
    }
    const missing = [...need].filter((id) => !covered.has(id)).sort();
    const head = `require ${control} in audience ${audience}: ${missing.length} violation(s)`;
    if (missing.length === 0) return { ok: true, text: head + '\n' };
    return {
        ok: false,
        text: head + '\n' + missing.map((id) => `- ${nodeLabel(m.arch, id)}`).join('\n') + '\n',
    };
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

main();
