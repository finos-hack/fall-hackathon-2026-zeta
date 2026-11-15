# calm-views-mcp — workspace-side MCP server for CALM views (spike)

Query the model instead of just graphing it. Stdio MCP server over the
local sidecars, offline. Complements (does not duplicate):

- Hub MCP tools (`calm-hub/.../mcp/tools/`): namespace resources over the
  wire. Ours: workspace files, no Hub, no network.
- Proposed `calm query` (#3661): graph deps/paths/blast-radius in the CLI.
  Ours: reader questions the graph layer does not ask (which views include
  this node, what does each reader see, excluded-with-reason).
- `calm-ai` prompts: authoring guidance. Ours: query interface.

Tools: `list_views`, `describe_view`, `views_for_node`, `nodes_in_view`,
`sql` (read-only over `nodes`, `relationships`, `rel_endpoints`, `views`,
`view_nodes`, `view_rels`, `flows`, `view_flows`; single
SELECT/WITH/VALUES/EXPLAIN, max 100 rows).

```sh
npm install && npm run build
node dist/test-client.js     # smoke test with a real MCP client
```

Configure any MCP client with command `node`, args
`<poc>/mcp/dist/index.js`, cwd `<poc>/mcp` (stdio, working directory is
the POC root). Example questions it answers: which views touch PII and
who audits them; what does the platform team operate; what did the
derived snapshot freeze.
