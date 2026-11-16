#!/usr/bin/env node
/** Derive a *.calm-view.json from seed nodes by graph traversal.
 *
 * Usage: node derive.js ARCH SEED [SEED ...] --depth N --id VIEW-ID --name NAME
 *        --audience a,b [--description TEXT] [--suggested-formats svg,json] [--out FILE]
 *    or: node derive.js ARCH --inside CONTAINER --id VIEW-ID --name NAME
 *        --audience a,b [--parent PARENT-VIEW-ID] [--description TEXT] [--out FILE]
 *
 * --inside derives the composed-of members of a container plus the border
 * nodes they connect to; with --parent it also wires drill-down on the
 * parent sidecar (container -> new view).
 */
import { join, dirname, resolve, relative } from 'node:path';
import { readdirSync } from 'node:fs';
import { ROOT, readJson, writeText, dumpJson, endpoints, type CalmArchitecture } from './calm.js';

interface Args {
    arch: string;
    seeds: string[];
    depth: number;
    id: string;
    name: string;
    audience: string;
    description: string;
    suggestedFormats: string;
    group: string | null;
    inside: string | null;
    parent: string | null;
    out: string | null;
}

function parseArgs(argv: string[]): Args {
    const args = argv.slice(2);
    const positional: string[] = [];
    const a: Args = {
        arch: '',
        seeds: [],
        depth: 1,
        id: '',
        name: '',
        audience: '',
        description: '',
        suggestedFormats: 'svg,json,markdown',
        group: null,
        inside: null,
        parent: null,
        out: null,
    };
    let i = 0;
    while (i < args.length) {
        const t = args[i] as string;
        if (t === '--depth') a.depth = parseInt(args[++i] as string, 10);
        else if (t === '--id') a.id = args[++i] as string;
        else if (t === '--name') a.name = args[++i] as string;
        else if (t === '--audience') a.audience = args[++i] as string;
        else if (t === '--description') a.description = args[++i] as string;
        else if (t === '--suggested-formats') a.suggestedFormats = args[++i] as string;
        else if (t === '--group') a.group = args[++i] as string;
        else if (t === '--inside') a.inside = args[++i] as string;
        else if (t === '--parent') a.parent = args[++i] as string;
        else if (t === '--out') a.out = args[++i] as string;
        else if (t.startsWith('-')) {
            console.error(`unknown argument: ${t}`);
            process.exit(2);
        } else positional.push(t);
        i++;
    }
    if (positional.length === 0) {
        console.error('usage: node derive.js ARCH SEED [SEED ...] --depth N --id VIEW-ID --name NAME --audience a,b');
        process.exit(2);
    }
    a.arch = positional[0] as string;
    a.seeds = positional.slice(1);
    for (const k of ['id', 'name', 'audience'] as const) {
        if (!a[k]) {
            console.error(`missing required argument: --${k}`);
            process.exit(2);
        }
    }
    if (a.inside && a.seeds.length > 0) {
        console.error('--inside takes no seed nodes');
        process.exit(2);
    }
    return a;
}

function localDate(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

export function main(): void {
    const args = parseArgs(process.argv);
    const arch = readJson(args.arch) as CalmArchitecture;
    const known = new Set((arch.nodes ?? []).map((n) => n['unique-id'] as string));
    const bad = args.seeds.filter((s) => !known.has(s));
    if (bad.length > 0) {
        console.error(`error: unknown seed node(s): ${bad.join(', ')}`);
        process.exit(1);
    }
    const adj = new Map<string, Set<string>>();
    const pairRels = new Map<string, Set<string>>();
    for (const r of arch.relationships ?? []) {
        const id = (r as Record<string, unknown>)['unique-id'] as string;
        const eps = [...endpoints(r as Record<string, unknown>)];
        for (const a of eps) {
            for (const b of eps) {
                if (a === b) continue;
                if (!adj.has(a)) adj.set(a, new Set());
                adj.get(a)?.add(b);
                const key = `${a}\0${b}`;
                if (!pairRels.has(key)) pairRels.set(key, new Set());
                pairRels.get(key)?.add(id);
            }
        }
    }
    const seenNodes = new Set(args.seeds);
    const seenRels = new Set<string>();
    let drillSeeds = [...args.seeds];
    let drillDepth = args.depth;
    if (args.inside) {
        const container = args.inside;
        if (!known.has(container)) {
            console.error(`error: unknown container node: ${container}`);
            process.exit(1);
        }
        const members = new Set<string>();
        for (const r of arch.relationships ?? []) {
            const co = ((r as Record<string, unknown>)['relationship-type'] as Record<string, unknown> | undefined)?.['composed-of'] as
                | { container?: string; nodes?: string[] }
                | undefined;
            if (co?.container === container) {
                for (const m of co.nodes ?? []) members.add(m);
            }
        }
        if (members.size === 0) {
            console.error(`error: no composed-of members under ${container}`);
            process.exit(1);
        }
        const border = new Set<string>();
        void border;
        for (const r of arch.relationships ?? []) {
            const rec = r as Record<string, unknown>;
            const eps = endpoints(rec);
            if (eps.size > 0 && [...eps].every((e) => members.has(e))) {
                seenRels.add(rec['unique-id'] as string);
            }
        }
        seenNodes.clear();
        for (const m of members) seenNodes.add(m);
        drillSeeds = [container];
        drillDepth = 1;
    } else {
        let frontier = new Set(args.seeds);
        for (let d = 0; d < args.depth; d++) {
            const nxt = new Set<string>();
            for (const a of frontier) {
                for (const b of adj.get(a) ?? []) {
                    for (const r of pairRels.get(`${a}\0${b}`) ?? []) seenRels.add(r);
                    if (!seenNodes.has(b)) nxt.add(b);
                }
            }
            for (const n of nxt) seenNodes.add(n);
            frontier = nxt;
        }
    }
    const out = args.out ?? join(ROOT, 'views', args.id + '.calm-view.json');
    let parentFile: string | null = null;
    let parentGroup: string | null = null;
    if (args.parent) {
        const viewsDir = join(ROOT, 'views');
        parentFile =
            readdirSync(viewsDir)
                .filter((f: string) => f.endsWith('.calm-view.json'))
                .map((f) => join(viewsDir, f))
                .find((p) => (readJson(p) as Record<string, unknown>)['unique-id'] === args.parent) ?? null;
        if (!parentFile) {
            console.error(`error: parent view not found: ${args.parent}`);
            process.exit(1);
        }
        const pg = (readJson(parentFile) as Record<string, unknown>)['group'];
        if (typeof pg === 'string') parentGroup = pg;
    }
    const defaultDescription = args.inside
        ? `Derived view: inside ${args.inside} (composed-of members only).`
        : `Derived view: ${args.depth}-hop neighborhood of ${args.seeds.join(', ')}.`;    const view = {
        $schema: '../schema/view.json',
        'unique-id': args.id,
        name: args.name,
        description: args.description || defaultDescription,
        audience: args.audience.split(','),
        'suggested-formats': args.suggestedFormats.split(','),
        ...(args.group ?? parentGroup ? { group: (args.group ?? parentGroup) as string } : {}),
        'derived-from': {
            seeds: [...drillSeeds].sort(),
            depth: drillDepth,
            generated: localDate(),
            tool: 'tools/derive.ts',
        },
        for: relative(dirname(resolve(out)), resolve(args.arch)),
        filter: {
            nodes: [...seenNodes].sort(),
            relationships: [...seenRels].sort(),
        },
    };
    writeText(out, dumpJson(view) + '\n');
    console.log(
        `${args.id}: derived ${seenNodes.size} nodes, ${seenRels.size} relationships ` +
            `from ${drillSeeds.length} seed(s) at depth ${drillDepth} -> ${out}`
    );
    if (args.parent && parentFile) {
        const parent = readJson(parentFile) as Record<string, unknown>;
        const dd = ((parent['drill-down'] as Record<string, string> | undefined) ?? {}) as Record<string, string>;
        dd[args.inside as string] = args.id;
        parent['drill-down'] = dd;
        writeText(parentFile, dumpJson(parent) + '\n');
        console.log(`${args.parent}: drill-down '${args.inside}' -> '${args.id}'`);
    }
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('/derive.js') || invoked.endsWith('\\derive.js')) {
    main();
}
