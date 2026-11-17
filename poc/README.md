# poc — CALM views, reconstructed from the fixed design

Built per `../docs/DESIGN.md` §4 and `../docs/LECTORES.md` (decided 2026-11-14).
Reference implementation in TypeScript, zero runtime dependencies, offline.

- `model/` — vendored base architecture (never modified, see
  `PROVENANCE.md`) + demo decorator (POC-authored, consumed by audit view) +
  `ech-0122.architecture.json`: the Swiss e-government reference model
  (eCH-0122 v2.0.1, 155 nodes, 247 relationships), converted from ArchiMate
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
  view, `gallery.html`). Committed as the reproducible record.

```sh
cd tools && npm install && npm run build && cd ..
node tools/dist/validate.js                 # 10/10 must report OK
node tools/dist/render.js views/kyc-audit.calm-view.json
node tools/dist/derive.js model/fluxnova-kyc-onboarding.architecture.json \
  kyc-sanctions-screening-svc --depth 1 \
  --id kyc-screening-neighborhood --name "Screening Neighborhood (derived)" \
  --audience risk-analysts
node tools/dist/gallery.js                 # renders/gallery.html
```

Green 2026-11-17: 10/10 validate OK (KYC 14/22, 10/9, 15/21, 4/3,
6/5, 4/3. eCH 100/81, 50/41, 61/7. calm-3 10/10).
Models sha unchanged. Regenerating wipes and reproduces the committed
outputs byte-identically (e2e).
