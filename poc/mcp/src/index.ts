#!/usr/bin/env node
/** calm-views-mcp: workspace-side MCP server for CALM views (spike).
 *
 * Complements the Hub namespace MCP tools and the proposed `calm query`
 * (#3661): it answers reader-oriented questions over local sidecars, offline.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadWorkspace, scopeOf, viewsForNode, readDecorator } from './views.js';
import { openViewsDb, query as runQuery } from './db.js';

const { arch, views } = loadWorkspace();
const db = await openViewsDb();

const server = new McpServer({ name: 'calm-views', version: '0.1.0' });

server.tool(
    'list_views',
    'List all CALM view sidecars in the workspace: id, name, audience, suggested formats.',
    {},
    async () => ({
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    views.map((v) => ({
                        id: v.uniqueId,
                        name: v.name,
                        audience: v.audience,
                        suggestedFormats: v.suggestedFormats,
                    }))
                ),
            },
        ],
    })
);

server.tool(
    'describe_view',
    'Full detail of one view: question it answers, filter, scope counts, excluded-with-reason, decorators.',
    { id: z.string().describe('View unique-id, e.g. kyc-audit-view') },
    async ({ id }: { id: string }) => {
        const view = views.find((v) => v.uniqueId === id);
        if (!view) throw new Error(`unknown view: ${id}`);
        const scope = scopeOf(arch, view);
        const decorators = (view.filter.decorators ?? []).map((d) => ({
            id: d,
            ...(readDecorator(view.dir, d) ?? {}),
        }));
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify({
                        id: view.uniqueId,
                        name: view.name,
                        description: view.description,
                        audience: view.audience,
                        nodeCount: scope.nodes.length,
                        relationshipCount: scope.relationships.length,
                        excluded: scope.excluded,
                        decorators,
                    }),
                },
            ],
        };
    }
);

server.tool(
    'views_for_node',
    'Which views include a given node unique-id (reader coverage question).',
    { node: z.string().describe('Node unique-id, e.g. kyc-kyc-database') },
    async ({ node }: { node: string }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(viewsForNode(arch, views, node)) }],
    })
);

server.tool(
    'nodes_in_view',
    'Scoped node list of one view: id, type, name.',
    { id: z.string().describe('View unique-id, e.g. kyc-platform-view') },
    async ({ id }: { id: string }) => {
        const view = views.find((v) => v.uniqueId === id);
        if (!view) throw new Error(`unknown view: ${id}`);
        return {
            content: [{ type: 'text' as const, text: JSON.stringify(scopeOf(arch, view).nodes) }],
        };
    }
);

server.tool(
    'sql',
    'Read-only SQL over the model and views. Tables: nodes(id,type,name), relationships(id,kind), rel_endpoints(rel,node), views(id,name,audience), view_nodes(view,node), view_rels(view,rel), flows(id,name), view_flows(view,flow). Single SELECT/WITH/VALUES/EXPLAIN or SHOW TABLES / SHOW COLUMNS FROM <table>; max 100 rows.',
    { query: z.string().describe('Read-only SQL statement') },
    async ({ query: sql }: { query: string }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(await runQuery(db, sql)) }],
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
