# poc — CALM views, reconstructed from the fixed design

Reference implementation in TypeScript, zero runtime dependencies, offline.
Design decisions (internal): views select by id, node-type, node metadata
or control claim. Zero presentation in the schema. `for` is relative and
provisional.

- `model/` — vendored base architecture (never modified, see
  `PROVENANCE.md`) + demo decorator (POC-authored, consumed by audit view) +
  `ech-0122.architecture.json`: the Swiss e-government reference model
  (eCH-0122 v2.0.1, 216 nodes, 287 relationships), converted from ArchiMate
  with layers preserved in node metadata. eCH is published by Verein eCH
  under terms that allow free use, sharing and development
  (https://www.ech.ch/de/ech/ech-0122/2.0.0). It is included here as the
  redistributable proof that views scale to real, complex architectures.
  It answers: what does a view buy you when the model is too big to show
  at once.
- `schema/view.json` — draft meta-schema: filter-only (ids, node-types,
  node metadata match, control claims over the model's real `controls`) +
  optional `suggested-formats` (non-normative) + optional `derived-from`
  provenance.
  NOT a standard. `for` resolves relative to the view file's directory
  (provisional, pending finos/architecture-as-code[#3624](https://github.com/finos/architecture-as-code/issues/3624)).
- `views/` — `kyc-platform`, `kyc-integration`, `kyc-audit` (hand-authored,
  one question each) + `kyc-screening-neighborhood` (derived, frozen
  snapshot + provenance, same schema) + `kyc-platform-inside` (drill-down
  target) + `kyc-audit-logging` (control-claims coverage view) +
  `ech-business`, `ech-application`, `ech-capabilities` (layer and
  capability aspects of the eCH model) + `calm-3-flows` (flows-axis fixture).
 - `tools/` — `validate`, `render`, `derive`, `gallery`, `query`,
   `archimate` (ArchiMate XML import with layer metadata and entity
   decoding, exercised on the real eCH model below)
   (TypeScript, stdlib only. `npm install` pulls just the compiler).
- `renders/` — generated outputs (scoped JSON + static SVG + Markdown per
  rendered view, `gallery.html`). Committed as the reproducible record.

## Anatomy of a view

```json
{
  "unique-id": "kyc-audit-logging",
  "name": "Audit logging coverage",
  "audience": ["auditors", "compliance-officers"],
  "for": "../model/fluxnova-kyc-onboarding.architecture.json",
  "filter": { "controls": ["audit-logging"] }
}
```

`unique-id` names it. `audience` says who reads it. `for` points at the
model (one path, or an array for a multi-file view). `filter` selects:
listed `nodes`, `node-types`, node `metadata` match, or `controls` claims
the node carries. Relationships close over the selected nodes, dangling
endpoints are excluded with reason, never silently dropped.

```sh
cd tools && npm install && npm run build && cd ..
node tools/dist/validate.js                 # 11/11 must report OK
node tools/dist/render.js views/kyc-audit.calm-view.json
node tools/dist/derive.js model/fluxnova-kyc-onboarding.architecture.json \
  kyc-sanctions-screening-svc --depth 1 \
  --id kyc-screening-neighborhood --name "Screening Neighborhood (derived)" \
  --audience risk-analysts
node tools/dist/gallery.js                 # renders/gallery.html
```

Green 2026-11-17: 11/11 validate OK. KYC views: 14/22, 10/9, 15/21,
4/3, 6/5, 4/3. Cross-model all-actors: 51 namespaced nodes. eCH views:
100/81, 50/41, 61/7. calm-3: 10/10. Models sha unchanged. Regenerating
wipes and reproduces the committed outputs byte-identically (e2e).
