/** Load model + sidecars and answer reader questions.
 *
 * Filter semantics come from calm-views-tools (same code the CLI uses),
 * so the MCP server can never disagree with `validate`/`render`.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    readJson,
    resolveView,
    endpoints,
    type CalmArchitecture,
    type CalmFilter,
    type JsonRecord,
} from 'calm-views-tools/dist/calm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const POC_ROOT = normalize(join(HERE, '..', '..'));

export interface LoadedView {
    uniqueId: string;
    name: string;
    description: string;
    audience: string[];
    suggestedFormats: string[];
    derivedFrom?: JsonRecord;
    for: string;
    filter: CalmFilter;
    dir: string;
}

export interface LoadedModel {
    arch: CalmArchitecture;
    views: LoadedView[];
}

export function loadWorkspace(root: string = POC_ROOT): LoadedModel {
    const archPath = join(root, 'model', 'fluxnova-kyc-onboarding.architecture.json');
    const arch = readJson(archPath) as CalmArchitecture;
    const viewsDir = join(root, 'views');
    const views: LoadedView[] = [];
    for (const name of readdirSync(viewsDir).filter((f) => f.endsWith('.calm-view.json')).sort()) {
        const path = join(viewsDir, name);
        const v = readJson(path) as JsonRecord;
        views.push({
            uniqueId: v['unique-id'] as string,
            name: (v['name'] as string) ?? '',
            description: (v['description'] as string) ?? '',
            audience: (v['audience'] as string[]) ?? [],
            suggestedFormats: (v['suggested-formats'] as string[]) ?? [],
            derivedFrom: v['derived-from'] as JsonRecord | undefined,
            for: v['for'] as string,
            filter: (v['filter'] as CalmFilter) ?? {},
            dir: viewsDir,
        });
    }
    return { arch, views };
}

export interface ViewScope {
    nodes: Array<{ id: string; type: string; name: string }>;
    relationships: Array<{ id: string; kind: string; endpoints: string[] }>;
    excluded: Array<{ id: string; outside: string[] }>;
}

export function scopeOf(arch: CalmArchitecture, view: LoadedView): ViewScope {
    const { inNodes, inRels, excluded } = resolveView(arch, view.filter);
    const nodeById = new Map((arch.nodes ?? []).map((n) => [n['unique-id'] as string, n]));
    const relById = new Map((arch.relationships ?? []).map((r) => [r['unique-id'] as string, r]));
    return {
        nodes: [...inNodes].sort().map((id) => {
            const n = (nodeById.get(id) ?? {}) as JsonRecord;
            return { id, type: (n['node-type'] as string) ?? '?', name: (n['name'] as string) ?? '' };
        }),
        relationships: [...inRels].sort().map((id) => {
            const r = (relById.get(id) ?? {}) as JsonRecord;
            const kind = Object.keys((r['relationship-type'] as JsonRecord | undefined) ?? { '?': null })[0] as string;
            return { id, kind, endpoints: [...endpoints(r)].sort() };
        }),
        excluded: [...excluded.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, outside]) => ({ id, outside })),
    };
}

export function viewsForNode(arch: CalmArchitecture, views: LoadedView[], nodeId: string): string[] {
    return views
        .filter((v) => resolveView(arch, v.filter).inNodes.has(nodeId))
        .map((v) => v.uniqueId);
}

export function readDecorator(viewsDir: string, id: string): JsonRecord | null {
    const p = join(viewsDir, `${id}.decorator.json`);
    if (!existsSync(p)) return null;
    try {
        return JSON.parse(readFileSync(p, 'utf8')) as JsonRecord;
    } catch {
        return null;
    }
}
