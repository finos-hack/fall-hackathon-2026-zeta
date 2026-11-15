#!/usr/bin/env node
/** Validate *.calm-view.json sidecars against schema/view.json and resolve them.
 *
 * Semantics (schema: schema/view.json): listed + closure; dangling refs warn,
 * never fail (partial views stay renderable — evidence for #2344 Q3).
 * Exit 0 unless a view fails schema validation or its `for` target is missing.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import {
    ROOT,
    readJson,
    resolveView,
    type CalmArchitecture,
    type CalmFilter,
    type JsonRecord,
} from './calm.js';

function fail(msg: string): never {
    console.error(msg);
    process.exit(1);
}

function checkSchema(view: unknown): string | null {
    if (typeof view !== 'object' || view === null) return 'view must be an object';
    const v = view as JsonRecord;
    for (const k of ['unique-id', 'name', 'for']) {
        if (typeof v[k] !== 'string') return `'${k}' is a required property`;
    }
    const allowed = new Set([
        '$schema',
        'unique-id',
        'name',
        'description',
        'audience',
        'suggested-formats',
        'derived-from',
        'for',
        'filter',
    ]);
    for (const k of Object.keys(v)) {
        if (!allowed.has(k)) return `additional properties not allowed ('${k}')`;
    }
    if (v['audience'] !== undefined && !Array.isArray(v['audience'])) {
        return `'audience' must be an array`;
    }
    const filter = v['filter'] as JsonRecord | undefined;
    if (filter !== undefined) {
        if (typeof filter !== 'object' || filter === null) return `'filter' must be an object`;
        const fallowed = new Set(['nodes', 'node-types', 'relationships', 'flows', 'decorators']);
        for (const k of Object.keys(filter)) {
            if (!fallowed.has(k)) return `filter: additional properties not allowed ('${k}')`;
            if (!Array.isArray(filter[k])) return `filter.${k} must be an array`;
        }
    }
    return null;
}

export function main(): number {
    const schemaPath = join(ROOT, 'schema', 'view.json');
    if (!existsSync(schemaPath)) fail(`schema missing: ${schemaPath}`);
    readJson(schemaPath);
    let errors = 0;
    const viewsDir = join(ROOT, 'views');
    for (const name of readdirSync(viewsDir).filter((f: string) => f.endsWith('.calm-view.json')).sort()) {
        const path = join(viewsDir, name);
        const view = readJson(path) as JsonRecord;
        const schemaError = checkSchema(view);
        if (schemaError) {
            console.log(`${name}: SCHEMA ERROR: ${schemaError}`);
            errors += 1;
            continue;
        }
        const filt = (view['filter'] as CalmFilter | undefined) ?? {};
        const viewDir = dirname(path);
        const archPath = normalize(join(viewDir, view['for'] as string));
        if (!existsSync(archPath)) {
            console.log(`${name}: ERROR: \`for\` target missing: ${view['for']}`);
            errors += 1;
            continue;
        }
        const arch = readJson(archPath) as CalmArchitecture;
        const rels = new Map((arch.relationships ?? []).map((r) => [r['unique-id'] as string, r]));
        const { inNodes, inRels, excluded, warnings } = resolveView(arch, filt);
        const listed = new Set(filt.relationships ?? []);
        const viaClosure = [...inRels].filter((u) => rels.has(u) && !listed.has(u)).length;
        console.log(
            `${name}: OK — ${inNodes.size} nodes, ${inRels.size} relationships ` +
                `(${(filt.relationships ?? []).length} listed, ${viaClosure} via closure)`
        );
        for (const u of [...excluded.keys()].sort()) {
            console.log(`  excluded rel '${u}' (endpoint(s) outside view: ${excluded.get(u)?.join(', ')})`);
        }
        for (const f of filt.flows ?? []) {
            console.log(`  warning: flow '${f}' has no sibling document in this POC`);
        }
        for (const d of filt.decorators ?? []) {
            if (!existsSync(join(viewDir, `${d}.decorator.json`))) {
                console.log(`  warning: decorator '${d}' has no sibling document`);
            }
        }
        for (const w of warnings) console.log(`  warning: ${w}`);
    }
    return errors > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith('/validate.js') || process.argv[1]?.endsWith('\\validate.js')) {
    process.exit(main());
}
