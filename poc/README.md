# poc — CALM views, reconstructed from the fixed design

Built per `../docs/DESIGN.md` §4 and `../docs/LECTORES.md` (decided 2026-11-14).
Reference implementation in TypeScript, zero runtime dependencies, offline.
(Ported from the original Python POC; renders are byte-identical.)

- `model/` — vendored base architecture (never modified, see
  `PROVENANCE.md`) + demo decorator (POC-authored, consumed by audit view).
- `schema/view.json` — draft meta-schema: filter-only + optional
  `suggested-formats` (non-normative) + optional `derived-from` provenance.
  NOT a standard. `for` resolves relative to the view file's directory
  (provisional, pending finos/architecture-as-code#3624).
- `views/` — `kyc-platform`, `kyc-integration`, `kyc-audit` (hand-authored,
  one question each) + `kyc-screening-neighborhood` (derived, frozen
  snapshot + provenance, same schema) + `calm-3-flows` (flows-axis fixture).
- `tools/` — `validate`, `render`, `derive`, `gallery` (TypeScript, stdlib
  only; `npm install` pulls just the compiler). `mcp/` — workspace-side
  MCP server over views + SQL (own package, own deps).
- `renders/` — generated outputs (scoped JSON + static SVG + Markdown per
  view, `gallery.html`). Committed as the reproducible record.

```sh
cd tools && npm install && npm run build && cd ..
node tools/dist/validate.js                 # 5/5 must report OK
node tools/dist/render.js views/kyc-audit.calm-view.json
node tools/dist/derive.js model/fluxnova-kyc-onboarding.architecture.json \
  kyc-sanctions-screening-svc --depth 1 \
  --id kyc-screening-neighborhood --name "Screening Neighborhood (derived)" \
  --audience risk-analysts
node tools/dist/gallery.js                 # renders/gallery.html
```

Green 2026-11-14: 5/5 validate OK (14/22, 10/9, 15/14, 4/3, 10/10),
4/4 SVG XML ok, model sha unchanged. Regenerating wipes and reproduces
the committed outputs byte-identically.
