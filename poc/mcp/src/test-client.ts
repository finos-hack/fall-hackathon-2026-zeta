#!/usr/bin/env node
/** Smoke-test the MCP server over stdio with a real MCP client. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({
    command: 'node',
    args: [join(HERE, 'index.js')],
});
const client = new Client({ name: 'calm-views-test', version: '0.1.0' });
await client.connect(transport);

const check = async (name: string, cond: boolean, detail = '') => {
    console.log(`${cond ? 'ok' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!cond) process.exitCode = 1;
};

const tools = await client.listTools();
await check('tools listed', (tools.tools ?? []).length >= 5, `${(tools.tools ?? []).length} tools`);

const call = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const res = (await client.callTool({ name, arguments: args })) as {
        content: Array<{ type: string; text?: string }>;
        isError?: boolean;
    };
    if (res.isError) throw new Error(res.content?.[0]?.text ?? 'tool error');
    const text = res.content?.[0]?.text ?? '';
    return text;
};

const views = JSON.parse(await call('list_views', {}));
await check('list_views has 5 views', views.length === 5, `${views.length} views`);

const audit = JSON.parse(await call('describe_view', { id: 'kyc-audit-view' }));
await check(
    'describe_view audit 15 nodes 14 rels',
    audit.nodeCount === 15 && audit.relationshipCount === 14,
    `${audit.nodeCount}/${audit.relationshipCount}`
);

const who = JSON.parse(await call('views_for_node', { node: 'kyc-kyc-database' }));
await check('views_for_node kyc-database includes audit', who.includes('kyc-audit-view'), who.join(','));

const scope = JSON.parse(await call('nodes_in_view', { id: 'kyc-platform-view' }));
await check('nodes_in_view platform has 14', scope.length === 14, `${scope.length} nodes`);

const rows = JSON.parse(
    await call('sql', { query: 'SELECT view, COUNT(*) AS n FROM view_nodes GROUP BY view ORDER BY n DESC' })
);
await check('sql group-by works', rows.length === 5 && rows[0].n === 15, JSON.stringify(rows));

let rejected = false;
try {
    await call('sql', { query: 'DROP TABLE nodes' });
} catch {
    rejected = true;
}
await check('sql rejects DROP', rejected);

const tables = await call('sql', { query: 'SHOW TABLES' });
await check('SHOW TABLES lists 8', tables.length === 8, `${tables.length} tables`);

const cols = await call('sql', { query: 'SHOW COLUMNS FROM view_nodes' });
await check('SHOW COLUMNS works', cols.length === 2, JSON.stringify(cols));

await client.close();
console.log('done');
