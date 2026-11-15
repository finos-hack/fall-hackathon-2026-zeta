/** In-memory SQLite (sql.js, WASM, no native builds) over model + views.
 * Read-only by construction: the sql tool only accepts a single
 * SELECT/WITH/VALUES/EXPLAIN statement.
 */
import initSqlJs, { type Database } from 'sql.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { endpoints, resolveView, type CalmArchitecture } from 'calm-views-tools/dist/calm.js';
import { loadWorkspace } from './views.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = join(HERE, '..', 'node_modules', 'sql.js', 'dist');

export type Row = Record<string, unknown>;

const str = (x: unknown): string => (typeof x === 'string' ? x : '');

export function isReadOnlyQuery(sql: string): boolean {
    const t = sql.trim();
    if (!/^(select|with|values|explain|show)\b/i.test(t)) return false;
    if (/;\s*\S/.test(t)) return false;
    return true;
}

async function openDb(): Promise<Database> {
    const SQL = await initSqlJs({ locateFile: (f: string) => join(WASM_DIR, f) });
    return new SQL.Database();
}

export async function openViewsDb(root?: string): Promise<Database> {
    const { arch, views } = loadWorkspace(root);
    const db = await openDb();
    db.exec('CREATE TABLE nodes(id TEXT PRIMARY KEY, type TEXT, name TEXT)');
    db.exec('CREATE TABLE relationships(id TEXT PRIMARY KEY, kind TEXT)');
    db.exec('CREATE TABLE rel_endpoints(rel TEXT, node TEXT)');
    const insNode = db.prepare('INSERT INTO nodes VALUES (?, ?, ?)');
    for (const n of arch.nodes ?? []) {
        const rec = n as Record<string, unknown>;
        insNode.run([str(rec['unique-id']), str(rec['node-type']), str(rec['name'])]);
    }
    insNode.free();
    const insRel = db.prepare('INSERT INTO relationships VALUES (?, ?)');
    const insEp = db.prepare('INSERT INTO rel_endpoints VALUES (?, ?)');
    for (const r of arch.relationships ?? []) {
        const rec = r as Record<string, unknown>;
        const kind = Object.keys((rec['relationship-type'] as Record<string, unknown> | undefined) ?? { '?': null })[0] as string;
        insRel.run([str(rec['unique-id']), kind ?? '?']);
        for (const e of endpoints(rec)) insEp.run([str(rec['unique-id']), e]);
    }
    insRel.free();
    insEp.free();
    db.exec('CREATE TABLE views(id TEXT PRIMARY KEY, name TEXT, audience TEXT)');
    db.exec('CREATE TABLE view_nodes(view TEXT, node TEXT)');
    db.exec('CREATE TABLE view_rels(view TEXT, rel TEXT)');
    db.exec('CREATE TABLE flows(id TEXT PRIMARY KEY, name TEXT)');
    db.exec('CREATE TABLE view_flows(view TEXT, flow TEXT)');
    const insView = db.prepare('INSERT INTO views VALUES (?, ?, ?)');
    const insVn = db.prepare('INSERT INTO view_nodes VALUES (?, ?)');
    const insVr = db.prepare('INSERT INTO view_rels VALUES (?, ?)');
    const insFlow = db.prepare('INSERT INTO flows VALUES (?, ?)');
    const insVf = db.prepare('INSERT INTO view_flows VALUES (?, ?)');
    const seenFlows = new Set<string>();
    for (const v of views) {
        insView.run([v.uniqueId, v.name, v.audience.join(', ')]);
        const { inNodes, inRels } = resolveView(arch, v.filter);
        for (const nid of inNodes) insVn.run([v.uniqueId, nid]);
        for (const rid of inRels) insVr.run([v.uniqueId, rid]);
        for (const f of v.filter.flows ?? []) {
            if (!seenFlows.has(f)) {
                seenFlows.add(f);
                insFlow.run([f, f]);
            }
            insVf.run([v.uniqueId, f]);
        }
    }
    for (const s of [insView, insVn, insVr, insFlow, insVf]) s.free();
    return db;
}

const TABLE_HELP: Array<{ table: string; description: string }> = [
    { table: 'nodes', description: 'id, type, name — every architecture node' },
    { table: 'relationships', description: 'id, kind — every relationship' },
    { table: 'rel_endpoints', description: 'rel, node — relationship endpoints' },
    { table: 'views', description: 'id, name, audience — the sidecars' },
    { table: 'view_nodes', description: 'view, node — scope membership' },
    { table: 'view_rels', description: 'view, rel — scope membership' },
    { table: 'flows', description: 'id, name — the 5 calm-3 flows' },
    { table: 'view_flows', description: 'view, flow — flow selection' },
];

function handleShow(db: Database, sql: string): Row[] | null {
    const t = sql.trim().replace(/;$/, '');
    if (/^show\s+tables$/i.test(t)) {
        return TABLE_HELP.map(({ table, description }) => ({ table, description }));
    }
    const cols = t.match(/^show\s+columns\s+from\s+([a-z_]+)$/i);
    if (cols) {
        const name = cols[1]?.toLowerCase() as string;
        const known = TABLE_HELP.map((h) => h.table);
        if (!known.includes(name)) throw new Error(`unknown table: ${cols[1]}`);
        const stmt = db.prepare(`SELECT name AS column_name, type AS column_type FROM pragma_table_info(?)`);
        try {
            stmt.bind([name]);
            const out: Row[] = [];
            while (stmt.step()) out.push(stmt.getAsObject() as Row);
            return out;
        } finally {
            stmt.free();
        }
    }
    return null;
}

export function query(db: Database, sql: string, limit = 100): Row[] {
    if (!isReadOnlyQuery(sql)) {
        throw new Error('only single SELECT/WITH/VALUES/EXPLAIN/SHOW statements are allowed');
    }
    if (/^\s*show\b/i.test(sql)) {
        const handled = handleShow(db, sql);
        if (handled === null) throw new Error('supported: SHOW TABLES, SHOW COLUMNS FROM <table>');
        return handled.slice(0, limit);
    }
    const stmt = db.prepare(sql);
    const out: Row[] = [];
    try {
        while (stmt.step() && out.length < limit) out.push(stmt.getAsObject() as Row);
    } finally {
        stmt.free();
    }
    return out;
}
