# Provenance

Every model in `model/` is either vendored untouched or converted from an
explicit upstream file. Nothing here is hand-written.

## KYC onboarding (demo model)

- File: `model/fluxnova-kyc-onboarding.architecture.json`
- Upstream: `finos/architecture-as-code`,
  `examples/fluxnova/fluxnova-kyc-onboarding.architecture.json`
  at commit `0626cea3` (2026-11-10). Chosen because it is also seeded as
  Hub demo data upstream.
- License: Apache-2.0 (upstream repo).
- Status: 20 nodes, 28 relationships, 0 flows. No top-level `controls`
  array. Nodes and relationships may carry inline `controls` (audit
  claims live there), and some services carry `interfaces`.
- sha256: `54a5d6066987cd41ffbaf5e8fb1e666a03816074c56aa8219111396abd2a4541`
- Verify at any time: `shasum -a 256
  model/fluxnova-kyc-onboarding.architecture.json`. The POC never
  modifies this file.

## eCH-0122 (reference model)

- File: `model/ech-0122.architecture.json`
- Upstream: eCH-0122 V2.0.1, Architektur E-Government Schweiz (Verein eCH),
  converted from `eCH-0122-2-0-1.archimate`
  (https://www.ech.ch/de/ech/ech-0122/2.0.0).
- License: eCH standards are free to use, share and develop
  ("unentgeltlich und uneingeschränkt genutzt, weiterverbreitet und
  weiterentwickelt werden"). The file below is converted to CALM, not
  redistributed as ArchiMate.
- Status: 155 nodes, 247 relationships. Archi layers preserved in node
  metadata (`archimate-layer`). Capabilities are kept as `capability` nodes.
- Verify at any time: re-run `node tools/dist/archimate.js` on a fresh
  copy of the upstream `.archimate` file.

## POC-authored

- `views/kyc-screening-effectiveness.decorator.json`: demo decorator,
  not upstream. Lives next to the views because decorators resolve as
  sibling documents of the view that consumes it.
