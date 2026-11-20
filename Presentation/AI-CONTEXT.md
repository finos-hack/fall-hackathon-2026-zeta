# Views as context for AI agents

Views double as the context unit for agents. `query context <view-id>`
resolves a named view into a compact LLM-ready bundle. Real output for the
KYC audit view (48 lines total, deterministic):

```
# view: kyc-audit-view (KYC Audit View)
audience: compliance-officers, auditors
group: KYC onboarding
model: model/fluxnova-kyc-onboarding.architecture.json sha256:54a5d6066987cd41ffbaf5e8fb1e666a03816074c56aa8219111396abd2a4541
scope: 12/20 nodes, 14/28 relationships
## nodes
- kyc-kyc-database [database] KYC Database
- kyc-sanctions-screening-svc [service] Sanctions & PEP Screening Service
## relationships
- kyc-sanctions-svc-to-kyc-db [connects] kyc-sanctions-screening-svc, kyc-kyc-database
## excluded (endpoints outside this view)
- kyc-engine-to-notification (outside: kyc-fluxnova-engine, kyc-notification-svc)
```

(Full output: run `node dist/query.js context kyc-audit-view` from `poc/tools`.)

The sha pins exactly which model bytes the answer is about. Scope states
what the agent sees (12/20) and excluded-with-reason states what it does
not. Governance lands before any agent reads anything: `coverage --require`
gates in CI fail the build when a node claiming audit-logging or
data-classification is missing from every auditor view. No server, no SQL.
Designed to sit on CalmGraph when calm query (#3661) lands.

## Two ways for an agent to reach a view

Same views, two doors. One for agents that work with files, one for agents
that work against a running Hub.

**1. Command line, against the repo.** From `poc/tools`:

```
node dist/query.js context kyc-audit-view
```

The command resolves the sidecar, reads the model file, and prints the
bundle shown above. No server, no SQL, no network. Same command, same
bundle, every time, which is what makes it testable in CI and quotable in
an audit: the sha in the header pins the exact bytes the answer is about.
Use this when the agent has the repo checked out, in a pipeline, or in a
review that must reproduce byte for byte.

**2. Hub via MCP, against stored architectures.** The Hub UI draws views
through three extension routes declared in `extension.json`: `lens`
(draw a named view), `export` (SVG or PNG download), and `poc` (the
presentation screen). All three are `readOnly`, and the upstream Hub
exposes read-only extension routes as MCP tools, so an agent with an MCP
client talks to `http://localhost:8080/mcp` instead of the terminal. It
names a namespace, an architecture id and version, and a view, and gets
back the drawn graph, a file download, or the POC markdown. No repo
checkout needed, and it works on whatever the Hub currently stores, not
on local files. Use this when the agent operates live systems, asks
follow-up questions across architectures, or needs a rendered image
rather than text.

Both doors serve the same named selections. The CLI bundle is the
auditable record; the MCP tools are the live handle.

- Repo: https://github.com/finos-hack/fall-hackathon-2026-zeta
- Demo video: https://youtu.be/FgxKLOsVypE
- https://github.com/finos/architecture-as-code/issues/2344
- https://github.com/finos/architecture-as-code/issues/3661
