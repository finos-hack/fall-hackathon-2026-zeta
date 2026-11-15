#!/usr/bin/env node
/** Shared CALM view semantics: filter resolution, lane layout, renderers.
 *
 * TypeScript port of the original Python POC (validate.py / render.py).
 * Byte-identical outputs are the contract: Python `json.dump(indent=2)`
 * escaping, `:.0f` banker's rounding and `xml.sax` escaping are replicated.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type JsonRecord = Record<string, unknown>;

export interface CalmArchitecture {
    nodes: JsonRecord[];
    relationships: JsonRecord[];
}

export interface CalmFilter {
    nodes?: string[];
    'node-types'?: string[];
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
    excluded: Map<string, string[]>;
    warnings: string[];
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
    const excluded = new Map<string, string[]>();
    for (const u of filt.relationships ?? []) {
        if (!rels.has(u)) warnings.push(`relationship '${u}' not in architecture`);
        else inRels.add(u);
    }
    for (const [id, r] of rels) {
        if (inRels.has(id)) continue;
        const eps = endpoints(r);
        if (eps.size > 0 && [...eps].every((e) => inNodes.has(e))) inRels.add(id);
        else if (eps.size > 0) excluded.set(id, [...eps].filter((e) => !inNodes.has(e)).sort());
    }
    return { inNodes, inRels, excluded, warnings };
}
