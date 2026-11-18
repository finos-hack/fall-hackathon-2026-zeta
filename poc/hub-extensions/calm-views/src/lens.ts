import { readFileSync } from 'node:fs';
import { join, basename, dirname, normalize } from 'node:path';
import { listViewFiles, namespaced, resolveMultiView, resolveView, type CalmFilter } from '../../../tools/dist/calm.js';
import { hasArchitectureShape, Problem } from './problem.js';

type Rec = Record<string, unknown>;

export interface LoadedView {
    uniqueId: string;
    name: string;
    audience: string[];
    description: string;
    drillDown: Record<string, string>;
    filter: Rec;
    for: unknown;
    architecture?: string;
    raw: string;
    /** View file path relative to the views directory. `for` resolves against its folder. */
    file: string;
}

export function baseNameOf(pathOrId: string): string {
    const noQuery = pathOrId.split('?')[0] as string;
    const parts = noQuery.split('/');
    return (parts[parts.length - 1] as string) ?? pathOrId;
}

export function loadViews(viewsDir: string): LoadedView[] {
    const out: LoadedView[] = [];
    let files: string[];
    try {
        files = listViewFiles(viewsDir);
    } catch {
        return out;
    }
    for (const name of files) {
        try {
            const raw = readFileSync(join(viewsDir, name), 'utf8');
            const v = JSON.parse(raw) as Rec;
            if (typeof v['unique-id'] !== 'string') continue;
            const dd = v['drill-down'];
            out.push({
                uniqueId: v['unique-id'] as string,
                name: (v['name'] as string) ?? '',
                audience: Array.isArray(v['audience']) ? (v['audience'] as string[]) : [],
                description: (v['description'] as string) ?? '',
                drillDown: typeof dd === 'object' && dd !== null && !Array.isArray(dd) ? (dd as Record<string, string>) : {},
                filter: (v['filter'] as Rec) ?? {},
                file: name,
                for: v['for'],
                ...(typeof v['architecture'] === 'string' ? { architecture: v['architecture'] as string } : {}),
                raw,
            });
        } catch {
            /* a broken sidecar never breaks the lens */
        }
    }
    return out;
}

/** Views whose `for` names the document being drawn (basename match, like the views dropdown). */
export function matchViews(views: LoadedView[], documentId: string, documentUniqueId = ''): LoadedView[] {
    const base = baseNameOf(documentId);
    const relatedBases = new Set([base]);
    if (documentUniqueId !== '') {
        for (const view of views) {
            if (view.architecture !== documentUniqueId) continue;
            const fors = Array.isArray(view.for) ? view.for : [view.for];
            for (const item of fors) {
                if (typeof item === 'string') relatedBases.add(baseNameOf(normalize(item)));
            }
        }
    }
    return views.filter((v) => {
        if (v.architecture !== undefined && documentUniqueId !== '' && v.architecture === documentUniqueId) return true;
        const fors = Array.isArray(v.for) ? v.for : [v.for];
        return fors.some((f) => typeof f === 'string' && relatedBases.has(baseNameOf(normalize(f))));
    });
}

function namespaceReferences(value: unknown, ids: Map<string, string>): unknown {
    if (typeof value === 'string') return ids.get(value) ?? value;
    if (Array.isArray(value)) return value.map((item) => namespaceReferences(item, ids));
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(Object.entries(value as Rec).map(([key, item]) => [key, namespaceReferences(item, ids)]));
}

/** Combines the files named by a multi-file view, replacing the active file with the Hub document. */
export function composeMultiViewDocument(document: Rec, documentId: string, view: LoadedView, viewsDir: string): Rec {
    const files = resolveMultiView(join(viewsDir, dirname(normalize(view.file))), { for: view.for, filter: view.filter });
    const activeBase = baseNameOf(documentId);
    const activeUniqueId = typeof document['unique-id'] === 'string' ? document['unique-id'] : '';
    const nodes: Rec[] = [];
    const relationships: Rec[] = [];
    let foundActive = false;

    for (const file of files) {
        const fileBase = basename(file.archPath);
        const fileUniqueId = typeof (file.arch as unknown as Rec)['unique-id'] === 'string'
            ? ((file.arch as unknown as Rec)['unique-id'] as string)
            : '';
        const isActive = fileBase === activeBase || (activeUniqueId !== '' && fileUniqueId === activeUniqueId);
        if (isActive) foundActive = true;
        const architecture = isActive ? document : (file.arch as unknown as Rec);
        const architectureNodes = (architecture['nodes'] as Rec[] | undefined) ?? [];
        const nodeIds = new Map<string, string>();
        for (const node of architectureNodes) {
            const id = node['unique-id'];
            if (typeof id === 'string') nodeIds.set(id, namespaced(file.archPath, id));
        }
        for (const node of architectureNodes) {
            const id = node['unique-id'];
            if (typeof id !== 'string') continue;
            nodes.push({
                ...node,
                'unique-id': nodeIds.get(id),
                'source-model': fileBase,
                ...(isActive ? { 'hub-calm-id': id } : {}),
            });
        }
        for (const relationship of (architecture['relationships'] as Rec[] | undefined) ?? []) {
            const id = relationship['unique-id'];
            if (typeof id !== 'string') continue;
            relationships.push({
                ...relationship,
                'unique-id': namespaced(file.archPath, id),
                'relationship-type': namespaceReferences(relationship['relationship-type'], nodeIds),
                ...(isActive ? { 'hub-calm-id': id } : {}),
            });
        }
    }
    if (!foundActive) {
        throw new Problem(422, 'The active architecture is not part of this multi-file view', 'Check that the view for entries match the architecture being opened.');
    }
    return { ...document, 'calm-views-multi-file': true, nodes, relationships };
}

export interface GraphNode {
    id: string;
    label: string;
    tags: string[];
    group?: string;
    calm: string[];
    tooltip?: string;
    link?: { params: Record<string, string> };
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    tags: string[];
    calm: string[];
}

export interface LensPanel {
    title: string;
    blocks: Array<{ type: string; [k: string]: unknown }>;
}

export interface GraphGroup {
    id: string;
    label: string;
    tags: string[];
    parent?: string;
    calm?: string[];
}

export interface LensReply {
    hubApi: 0;
    kind: 'graph';
    title: string;
    layout: { algorithm: string; direction?: string };
    graph: { groups: GraphGroup[]; nodes: GraphNode[]; edges: GraphEdge[] };
    controls: Array<{ type: 'segmented' | 'select'; param: string; label: string; value?: string; items: Array<{ value: string; label: string }> }>;
    panels: LensPanel[];
}

const kindOf = (rel: Rec): string => {
    const rt = (rel['relationship-type'] as Rec | undefined) ?? {};
    return Object.keys(rt)[0] ?? 'relates';
};

const endpointsOf = (rel: Rec): string[] => {
    const rt = (rel['relationship-type'] as Rec | undefined) ?? {};
    if (typeof rt['connects'] === 'object' && rt['connects'] !== null) {
        const c = rt['connects'] as Rec;
        return [(c['source'] as Rec)?.['node'], (c['destination'] as Rec)?.['node']].filter((x): x is string => typeof x === 'string');
    }
    if (typeof rt['interacts'] === 'object' && rt['interacts'] !== null) {
        const c = rt['interacts'] as Rec;
        return [c['actor'], ...((c['nodes'] as string[]) ?? [])].filter((x): x is string => typeof x === 'string');
    }
    return [];
};

export interface LensOptions {
    nodeType?: string | null;
    relType?: string | null;
    layout?: string | null;
    cloud?: string | null;
    regionGroup?: string | null;
    env?: string | null;
    layer?: string | null;
}

const REL_TYPES = ['all', 'connects', 'interacts', 'composed-of', 'deployed-in'];
const REL_LABELS: Record<string, string> = {
    all: 'All relationships',
    connects: 'connects',
    interacts: 'interacts',
    'composed-of': 'composed-of',
    'deployed-in': 'deployed-in',
};
const LAYOUTS: Record<string, { label: string; layout: { algorithm: string; direction?: string } }> = {
    'layered-right': { label: 'Layered, left to right', layout: { algorithm: 'layered', direction: 'right' } },
    'layered-down': { label: 'Layered, top to bottom', layout: { algorithm: 'layered', direction: 'down' } },
    tree: { label: 'Tree', layout: { algorithm: 'tree', direction: 'down' } },
    radial: { label: 'Radial', layout: { algorithm: 'radial' } },
};
const NODE_TYPE = /^[a-z0-9][a-z0-9:_-]{0,63}$/;
const DIMENSION_VALUE = /^[a-z][a-z0-9-]{0,63}$/;
const MULTICLOUD_DIMENSIONS: Record<string, Array<keyof Pick<LensOptions, 'cloud' | 'regionGroup' | 'env' | 'layer'>>> = {
    'multicloud-cloud': ['cloud'],
    'multicloud-region': ['cloud', 'regionGroup'],
    'multicloud-environment': ['cloud', 'regionGroup', 'env'],
    'multicloud-layer': ['cloud', 'regionGroup', 'env', 'layer'],
};
const DIMENSION_METADATA: Record<string, string> = { cloud: 'cloud', regionGroup: 'region-group', env: 'env', layer: 'layer' };

function dimensionValue(value: string | null): string | null {
    return value === null || value === 'all' || DIMENSION_VALUE.test(value) ? value : null;
}

/** Query values from the lens controls. Anything unknown falls back to the default, never to an error. */
export function parseOptions(url: URL): LensOptions {
    const nodeType = url.searchParams.get('nodeType');
    const relType = url.searchParams.get('relType');
    const layout = url.searchParams.get('layout');
    const cloud = dimensionValue(url.searchParams.get('cloud'));
    const regionGroup = dimensionValue(url.searchParams.get('regionGroup'));
    const env = dimensionValue(url.searchParams.get('env'));
    const layer = dimensionValue(url.searchParams.get('layer'));
    return {
        nodeType: nodeType === null || nodeType === 'all' || NODE_TYPE.test(nodeType) ? nodeType : null,
        relType: relType !== null && REL_TYPES.includes(relType) ? relType : null,
        layout: layout !== null && layout in LAYOUTS ? layout : null,
        cloud,
        regionGroup,
        env,
        layer,
    };
}

/**
 * Draw one named view over the document Hub sent. Views come from sidecar
 * files, matched by basename of their `for` against basename of the
 * document id. Without a view the first match answers; without views,
 * or with an unknown view id, the answer is a 4xx problem, never an
 * empty diagram.
 */
export function viewsLensReply(
    document: Rec,
    views: LoadedView[],
    viewId: string | null,
    documentId: string,
    options: LensOptions = {}
): LensReply {
    const matched = matchViews(views, documentId, typeof document['unique-id'] === 'string' ? (document['unique-id'] as string) : '');
    if (matched.length === 0) {
        throw new Problem(
            404,
            'No views select this architecture',
            'No *.calm-view.json names this document in its for. Selections live in sidecars, not in the model.'
        );
    }
    // The Hub keeps the view parameter when the user moves to another architecture. A view that this
    // architecture does not have falls back to its first view, and the panel says so.
    const requested = viewId === null ? undefined : matched.find((v) => v.uniqueId === viewId);
    const view = requested ?? (matched[0] as LoadedView);
    const fellBack = viewId !== null && requested === undefined;
    const arch = {
        nodes: ((document.nodes as Rec[] | undefined) ?? []) as Rec[],
        relationships: ((document.relationships as Rec[] | undefined) ?? []) as Rec[]
    };
    const multiFile = document['calm-views-multi-file'] === true;
    const filter = { ...view.filter, metadata: { ...((view.filter.metadata as Rec | undefined) ?? {}) } } as CalmFilter & { metadata: Record<string, string[]> };
    const dimensions = MULTICLOUD_DIMENSIONS[view.uniqueId] ?? [];
    for (const dimension of dimensions) {
        const value = options[dimension];
        const metadataKey = DIMENSION_METADATA[dimension] as string;
        if (value && value !== 'all') filter.metadata[metadataKey] = [value];
    }
    const metadataValues = (key: string): string[] => [...new Set(arch.nodes
        .map((node) => (node['metadata'] as Rec | undefined)?.[key])
        .filter((value): value is string => typeof value === 'string'))].sort();
    if (view.uniqueId === 'multicloud-cloud') {
        if (!options.cloud || options.cloud === 'all') filter.metadata['kind'] = ['cloud'];
        else delete filter.metadata['kind'];
    } else if (view.uniqueId === 'multicloud-region') {
        if (!options.regionGroup || options.regionGroup === 'all') filter.metadata['kind'] = ['region'];
        else delete filter.metadata['kind'];
    } else if (view.uniqueId === 'multicloud-environment'
        && (!options.env || options.env === 'all')) {
        filter.metadata['env'] = metadataValues('env');
    } else if (view.uniqueId === 'multicloud-layer'
        && (!options.layer || options.layer === 'all')) {
        filter.metadata['layer'] = metadataValues('layer');
    }
    const resolved = resolveView(arch, filter);
    const { excluded, liftedEndpoints } = resolved;
    const nodeById = new Map((arch.nodes as Rec[]).map((n) => [n['unique-id'] as string, n]));
    const relById = new Map((arch.relationships as Rec[]).map((r) => [r['unique-id'] as string, r]));
    // Type and relationship selectors narrow the view; the exclusions still name what the view leaves out.
    const wantType = options.nodeType && options.nodeType !== 'all' ? options.nodeType : null;
    const wantRel = options.relType && options.relType !== 'all' ? options.relType : null;
    const inNodes = new Set([...resolved.inNodes].filter((id) => wantType === null || String(nodeById.get(id)?.['node-type']) === wantType));
    const inRels = new Set([...resolved.inRels].filter((id) => wantRel === null || kindOf(relById.get(id) ?? {}) === wantRel));
    const drill = view.drillDown;
    const selectedDimension = (selected: string | null | undefined, nodeValue: unknown): string =>
        selected && selected !== 'all' ? selected : typeof nodeValue === 'string' ? nodeValue : 'all';
    const multiCloudLink = (node: Rec): GraphNode['link'] | undefined => {
        const metadata = (node['metadata'] as Rec | undefined) ?? {};
        const cloud = selectedDimension(options.cloud, metadata['cloud']);
        const regionGroup = selectedDimension(options.regionGroup, metadata['region-group']);
        const env = selectedDimension(options.env, metadata['env']);
        const layer = selectedDimension(options.layer, metadata['layer']);
        const params: Record<string, string> = { regionGroup: 'all', env: 'all', layer: 'all' };
        if (view.uniqueId === 'multicloud-global' && (metadata.kind === 'cloud' || metadata.kind === 'ou' || metadata.kind === 'folder')) {
            return { params: { view: 'multicloud-cloud', cloud, ...params } };
        }
        if (view.uniqueId === 'multicloud-global' && metadata.kind === 'region') {
            return { params: { view: 'multicloud-region', cloud, regionGroup, env: 'all', layer: 'all' } };
        }
        if (view.uniqueId === 'multicloud-cloud' && typeof metadata['region-group'] === 'string') {
            return { params: { view: 'multicloud-region', cloud, regionGroup, env: 'all', layer: 'all' } };
        }
        if (view.uniqueId === 'multicloud-region' && typeof metadata['env'] === 'string') {
            return { params: { view: 'multicloud-environment', cloud, regionGroup, env, layer: 'all' } };
        }
        if (view.uniqueId === 'multicloud-environment' && typeof metadata['layer'] === 'string') {
            return { params: { view: 'multicloud-layer', cloud, regionGroup, env, layer } };
        }
        return undefined;
    };
    const containerOf = new Map<string, string>();
    for (const id of [...inRels].sort()) {
        const c = ((relById.get(id) ?? {})['relationship-type'] as Rec | undefined)?.['composed-of'] as
            | { container?: unknown; nodes?: unknown }
            | undefined;
        if (typeof c !== 'object' || c === null) continue;
        if (typeof c.container !== 'string' || !inNodes.has(c.container)) continue;
        for (const m of Array.isArray(c.nodes) ? (c.nodes as unknown[]) : []) {
            if (typeof m === 'string' && inNodes.has(m) && !containerOf.has(m) && m !== c.container) {
                containerOf.set(m, c.container);
            }
        }
    }
    const groupId = (id: string): string => `group:${id}`;
    const nodes: GraphNode[] = [...inNodes].sort().map((id) => {
        const n = nodeById.get(id) ?? {};
        const link = multiCloudLink(n) ?? (typeof drill[id] === 'string' ? { params: { view: drill[id] as string } } : undefined);
        return {
            id,
            label: (n['name'] as string) ?? id,
            tags: ['Box', String(n['node-type'] ?? 'unknown')],
            ...(containerOf.has(id) ? { group: groupId(containerOf.get(id) as string) } : {}),
            calm: typeof n['hub-calm-id'] === 'string' ? [n['hub-calm-id'] as string] : multiFile ? [] : [id],
            ...(link ? { link } : {}),
            ...(typeof n['description'] === 'string' ? { tooltip: n['description'] as string } : {}),
        };
    });
    const groups = [...new Set(containerOf.values())].sort().map((id) => {
        const container = nodeById.get(id) ?? {};
        const calm = typeof container['hub-calm-id'] === 'string'
            ? [container['hub-calm-id'] as string]
            : multiFile ? [] : [id];
        return {
            id: groupId(id),
            label: (container['name'] as string) ?? id,
            tags: ['Box', 'container'],
            ...(containerOf.has(id) ? { parent: groupId(containerOf.get(id) as string) } : {}),
            ...(calm.length > 0 ? { calm } : {}),
        };
    });
    const drawn = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = [...inRels]
        .sort()
        .map((id) => {
            const r = relById.get(id) ?? {};
            const lifted = liftedEndpoints.get(id) ?? endpointsOf(r);
            const [a, b] = lifted.length >= 2 ? [lifted[0], lifted[1]] : [undefined, undefined];
            if (a === undefined || b === undefined || a === b || !drawn.has(a) || !drawn.has(b)) return undefined;
            return { id, source: a, target: b, tags: [kindOf(r)], calm: typeof r['hub-calm-id'] === 'string' ? [r['hub-calm-id'] as string] : multiFile ? [] : [id] };
        })
        .filter((e): e is GraphEdge => e !== undefined);
    const exclusions = [...excluded.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    const countTypes = (items: Rec[], typeOf: (item: Rec) => string): Map<string, number> => {
        const counts = new Map<string, number>();
        for (const item of items) {
            const type = typeOf(item);
            counts.set(type, (counts.get(type) ?? 0) + 1);
        }
        return counts;
    };
    const modelNodeTypes = countTypes(arch.nodes, (node) => String(node['node-type'] ?? 'unknown'));
    const viewNodeTypes = countTypes(nodes.map((node) => nodeById.get(node.id) ?? {}), (node) => String(node['node-type'] ?? 'unknown'));
    const modelRelationshipTypes = countTypes(arch.relationships, kindOf);
    const viewRelationshipTypes = countTypes([...inRels].map((id) => relById.get(id) ?? {}), kindOf);
    const formatTypeCounts = (model: Map<string, number>, viewCounts: Map<string, number>): string =>
        [...new Set([...model.keys(), ...viewCounts.keys()])]
            .sort()
            .map((type) => `${type} ${model.get(type) ?? 0}/${viewCounts.get(type) ?? 0}`)
            .join(' · ') || 'none';
    const multiCloudTitle = view.uniqueId === 'multicloud-cloud' && options.cloud && options.cloud !== 'all'
        ? options.cloud.toUpperCase()
        : view.uniqueId === 'multicloud-region' && options.regionGroup && options.regionGroup !== 'all'
            ? `${options.regionGroup.toUpperCase()} region group`
            : view.uniqueId === 'multicloud-environment' && options.env && options.env !== 'all'
                ? `${options.env.toUpperCase()} environment`
                : view.uniqueId === 'multicloud-layer' && options.layer && options.layer !== 'all'
                    ? `${options.layer[0]?.toUpperCase()}${options.layer.slice(1)} layer`
                    : undefined;
    const controls: LensReply['controls'] = [
        {
            type: 'select',
            param: 'view',
            label: 'View',
            value: view.uniqueId,
            items: matched.map((candidate) => ({ value: candidate.uniqueId, label: candidate.name || candidate.uniqueId })),
        },
        {
            type: 'select',
            param: 'nodeType',
            label: 'Node type',
            value: options.nodeType ?? 'all',
            items: [
                { value: 'all', label: 'All types' },
                ...[...new Set(arch.nodes.map((node) => String(node['node-type'] ?? 'unknown')))].sort().map((type) => ({ value: type, label: type })),
            ],
        },
        {
            type: 'select',
            param: 'relType',
            label: 'Relationship',
            value: options.relType ?? 'all',
            items: REL_TYPES.map((type) => ({ value: type, label: REL_LABELS[type] as string })),
        },
        {
            type: 'select',
            param: 'layout',
            label: 'Layout',
            value: options.layout ?? 'layered-right',
            items: Object.entries(LAYOUTS).map(([value, item]) => ({ value, label: item.label })),
        },
    ];
    const dimensionLabels: Record<'cloud' | 'regionGroup' | 'env' | 'layer', string> = {
        cloud: 'Cloud', regionGroup: 'Region group', env: 'Environment', layer: 'Layer',
    };
    const dimensionItems: Record<'cloud' | 'regionGroup' | 'env' | 'layer', string[]> = {
        cloud: ['aws', 'gcp'],
        regionGroup: metadataValues('region-group'),
        env: metadataValues('env'),
        layer: metadataValues('layer'),
    };
    for (const dimension of MULTICLOUD_DIMENSIONS[view.uniqueId] ?? []) {
        controls.push({
            type: 'select',
            param: dimension,
            label: dimensionLabels[dimension],
            value: options[dimension] ?? 'all',
            items: [
                { value: 'all', label: `All ${dimensionLabels[dimension].toLowerCase()}s` },
                ...dimensionItems[dimension].map((value) => ({ value, label: value })),
            ],
        });
    }
    return {
        hubApi: 0 as const,
        kind: 'graph' as const,
        title: multiCloudTitle ?? (view.name || view.uniqueId),
        layout: (LAYOUTS[options.layout ?? 'layered-right'] ?? LAYOUTS['layered-right'] as { layout: { algorithm: string; direction?: string } }).layout,
        graph: { groups, nodes, edges },
        controls,
        panels: [
            {
                title: 'Selection',
                blocks: [
                    {
                        type: 'table',
                        columns: ['Metric', 'Model / view'],
                        rows: [
                            ['Nodes', `${arch.nodes.length} / ${inNodes.size}`],
                            ['Relationships', `${arch.relationships.length} / ${inRels.size}`],
                            ['Nodes by type', formatTypeCounts(modelNodeTypes, viewNodeTypes)],
                            ['Relationships by type', formatTypeCounts(modelRelationshipTypes, viewRelationshipTypes)],
                            ['Audience', view.audience.join(', ') || 'anyone'],
                        ],
                    },
                    ...(fellBack ? [{ type: 'alert', tone: 'warning', text: `View '${viewId}' is not defined for this architecture; showing ${view.uniqueId}. Known views: ${matched.map((v) => v.uniqueId).join(', ')}` }] : []),
                ],
            },
            ...(exclusions.length > 0
                ? [
                      {
                          title: 'Excluded with reason',
                          blocks: [
                              {
                                  type: 'table',
                                  columns: ['relationship', 'outside view'],
                                  rows: exclusions.map(([id, outside]) => [id, (outside as string[]).join(', ')]),
                              },
                          ],
                      },
                  ]
                : []),
            {
                title: 'View definition',
                blocks: [
                    {
                        type: 'markdown',
                        text: ['The sidecar that drew this diagram. Copy it into a `*.calm-view.json` to reuse the view.', '', '```json', view.raw.trimEnd(), '```'].join('\n'),
                    },
                ],
            },
        ],
    };
}

export function parseView(value: string | null): string | null {
    return value && value.length > 0 ? value : null;
}

export { hasArchitectureShape };
