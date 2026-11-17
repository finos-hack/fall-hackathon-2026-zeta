#!/usr/bin/env node
/** Shared CALM view semantics: filter resolution, lane layout, renderers.
 *
 * TypeScript port of the original Python POC (validate.py / render.py).
 * Byte-identical outputs are the contract: Python `json.dump(indent=2)`
 * escaping, `:.0f` banker's rounding and `xml.sax` escaping are replicated.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, normalize, basename } from 'node:path';

export type JsonRecord = Record<string, unknown>;

export interface CalmArchitecture {
    nodes: JsonRecord[];
    relationships: JsonRecord[];
}

export interface CalmFilter {
    nodes?: string[];
    'node-types'?: string[];
    /** Node metadata match: the node is in the view when, for every key,
     *  its metadata value is one of the listed values. */
    metadata?: Record<string, string[]>;
    /** Control claim match: the node or relationship is in the view when
     *  it carries one of the listed control keys in `controls`. */
    controls?: string[];
    relationships?: string[];
    flows?: string[];
    decorators?: string[];
}

export const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

export function readJson(path: string): unknown {
    return JSON.parse(readFileSync(path, 'utf8'));
}

/** Python xml.sax.saxutils.escape default: & < > only. */
export function escXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Python f"{x:.0f}": round half to even (banker's), unlike Math.round. */
export function pyFloat0(x: number): string {
    const f = Math.floor(x);
    const d = x - f;
    if (d < 0.5) return String(f);
    if (d > 0.5) return String(f + 1);
    return String(f % 2 === 0 ? f : f + 1);
}

/** Python json.dump ensure_ascii=True: escape every non-ASCII code point. */
export function ensureAscii(s: string): string {
    return s.replace(/[\u0080-\uFFFF]/g, (ch) => {
        const cp = ch.codePointAt(0) as number;
        if (cp > 0xffff) {
            const hi = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
            const lo = ((cp - 0x10000) % 0x400) + 0xdc00;
            return `\\u${hi.toString(16).padStart(4, '0')}\\u${lo.toString(16).padStart(4, '0')}`;
        }
        return `\\u${cp.toString(16).padStart(4, '0')}`;
    });
}

/** Python json.dump(obj, indent=2): separators (',', ': ') + ascii + no trailing newline. */
export function dumpJson(value: unknown): string {
    return ensureAscii(JSON.stringify(value, null, 2));
}

export function writeText(path: string, text: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
}

/** All node unique-ids a relationship touches, by relationship-type. */
export function endpoints(rel: JsonRecord): Set<string> {
    const out = new Set<string>();
    const rt = (rel['relationship-type'] as JsonRecord | undefined) ?? {};
    const connects = rt['connects'] as
        | { source?: { node?: string }; destination?: { node?: string } }
        | undefined;
    if (connects) {
        if (connects.source?.node) out.add(connects.source.node);
        if (connects.destination?.node) out.add(connects.destination.node);
    }
    const interacts = rt['interacts'] as { actor?: string; nodes?: string[] } | undefined;
    if (interacts) {
        if (interacts.actor) out.add(interacts.actor);
        for (const n of interacts.nodes ?? []) out.add(n);
    }
    for (const key of ['composed-of', 'deployed-in'] as const) {
        const c = rt[key] as { container?: string; nodes?: string[] } | undefined;
        if (c) {
            if (c.container) out.add(c.container);
            for (const n of c.nodes ?? []) out.add(n);
        }
    }
    return out;
}

export interface ViewResolution {
    inNodes: Set<string>;
    inRels: Set<string>;
    /** Relationship id to the endpoints it is drawn with (after lifting). */
    liftedEndpoints: Map<string, string[]>;
    excluded: Map<string, string[]>;
    warnings: string[];
}

export interface ResolvedFile {
    archPath: string;
    arch: CalmArchitecture;
    resolution: ViewResolution;
}

/** Multi-file view (experimental, internal): `for` accepts an array of
 *  model paths. Each file resolves independently with the same filter;
 *  ids are namespaced `basename(node-id)` to keep files apart. No dedup
 *  is claimed: the same service in two files is two nodes. This is the
 *  honest interim semantics until shared identity exists
 *  (finos/calm-schema#27). */
export function resolveMultiView(viewDir: string, view: JsonRecord): ResolvedFile[] {
    const fors = view['for'];
    const paths = (Array.isArray(fors) ? fors : [fors]) as string[];
    return paths.map((rel) => {
        const archPath = normalize(join(viewDir, rel as string));
        const arch = readJson(archPath) as CalmArchitecture;
        const filt = (view['filter'] as CalmFilter | undefined) ?? {};
        return { archPath, arch, resolution: resolveView(arch, filt) };
    });
}

export function namespaced(archPath: string, id: string): string {
    return `${basename(archPath, '.architecture.json')}/${id}`;
}

/** Union scope across the resolved files, with namespaced node ids. */
export function unionScope(files: ResolvedFile[]): { nodes: string[]; rels: Array<{ file: string; id: string }> } {
    const nodes = new Set<string>();
    const rels: Array<{ file: string; id: string }> = [];
    for (const f of files) {
        for (const id of f.resolution.inNodes) nodes.add(namespaced(f.archPath, id));
        for (const id of f.resolution.inRels) rels.push({ file: basename(f.archPath), id });
    }
    return { nodes: [...nodes].sort(), rels };
}

/** Child node to all its containers, transitively (composed-of / deployed-in). */
export function containerAncestors(arch: CalmArchitecture): Map<string, Set<string>> {
    const parents = new Map<string, Set<string>>();
    const add = (child: string, parent: string) => {
        if (child === parent) return;
        if (!parents.has(child)) parents.set(child, new Set());
        parents.get(child)?.add(parent);
    };
    for (const r of arch.relationships ?? []) {
        const rt = ((r as JsonRecord)['relationship-type'] as JsonRecord | undefined) ?? {};
        for (const key of ['composed-of', 'deployed-in'] as const) {
            const c = rt[key] as { container?: string; nodes?: string[] } | undefined;
            if (c?.container) {
                for (const m of c.nodes ?? []) add(m, c.container);
            }
        }
    }
    const closure = new Map<string, Set<string>>();
    const ancestorsOf = (n: string, seen: Set<string>): Set<string> => {
        const out = new Set<string>();
        for (const p of parents.get(n) ?? []) {
            if (seen.has(p)) continue;
            out.add(p);
            for (const q of ancestorsOf(p, new Set([...seen, n]))) out.add(q);
        }
        return out;
    };
    for (const n of arch.nodes ?? []) {
        const id = (n as JsonRecord)['unique-id'] as string;
        if (id) closure.set(id, ancestorsOf(id, new Set()));
    }
    return closure;
}

/** Nearest visible node for an endpoint: itself, else the closest visible container (BFS up). */
function liftEndpoint(e: string, inNodes: Set<string>, ancestors: Map<string, Set<string>>): string | null {
    if (inNodes.has(e)) return e;
    const seen = new Set([e]);
    const queue = [e];
    while (queue.length > 0) {
        const cur = queue.shift() as string;
        for (const p of ancestors.get(cur) ?? []) {
            if (seen.has(p)) continue;
            seen.add(p);
            if (inNodes.has(p)) return p;
            queue.push(p);
        }
    }
    return null;
}

/** Apply the filter: listed ids plus relationship closure. Mirrors resolve_view. */
export function resolveView(arch: CalmArchitecture, filt: CalmFilter): ViewResolution {
    const nodes = new Map<string, JsonRecord>();
    for (const n of arch.nodes ?? []) {
        const id = n['unique-id'] as string;
        if (id) nodes.set(id, n);
    }
    const inNodes = new Set<string>(filt.nodes ?? []);
    for (const [id, n] of nodes) {
        const t = n['node-type'] as string;
        if ((filt['node-types'] ?? []).includes(t)) inNodes.add(id);
        const meta = (n['metadata'] as JsonRecord | undefined) ?? {};
        const wanted = filt.metadata ?? {};
        if (
            Object.keys(wanted).length > 0 &&
            Object.entries(wanted).every(([k, vals]) => (vals as string[]).includes(meta[k] as string))
        ) {
            inNodes.add(id);
        }
        const ctrl = (n['controls'] as JsonRecord | undefined) ?? {};
        if ((filt.controls ?? []).some((c) => c in ctrl)) inNodes.add(id);
    }
    const warnings: string[] = [];
    for (const u of filt.nodes ?? []) {
        if (!nodes.has(u)) warnings.push(`node '${u}' not in architecture`);
    }
    const rels = new Map<string, JsonRecord>();
    for (const r of arch.relationships ?? []) {
        const id = r['unique-id'] as string;
        if (id) rels.set(id, r);
    }
    const inRels = new Set<string>();
    const liftedEndpoints = new Map<string, string[]>();
    const excluded = new Map<string, string[]>();
    const ancestors = containerAncestors(arch);
    const liftAll = (id: string, r: JsonRecord): boolean => {
        const eps = endpoints(r);
        if (eps.size === 0) return false;
        const lifted: string[] = [];
        for (const e of eps) {
            const l = liftEndpoint(e, inNodes, ancestors);
            if (l === null) return false;
            if (!lifted.includes(l)) lifted.push(l);
        }
        if (lifted.length <= 1) return false;
        inRels.add(id);
        liftedEndpoints.set(id, lifted);
        return true;
    };
    for (const u of filt.relationships ?? []) {
        if (!rels.has(u)) warnings.push(`relationship '${u}' not in architecture`);
        else if (!liftAll(u, rels.get(u) as JsonRecord)) {
            excluded.set(u, [...endpoints(rels.get(u) as JsonRecord)].filter((e) => !inNodes.has(e)).sort());
        }
    }
    for (const [id, r] of rels) {
        if (inRels.has(id)) continue;
        if (!liftAll(id, r)) {
            const eps = endpoints(r);
            if (eps.size > 0) {
                excluded.set(id, [...eps].filter((e) => !inNodes.has(e)).sort());
            }
        }
    }
    return { inNodes, inRels, liftedEndpoints, excluded, warnings };
}
