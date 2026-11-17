# Provenance — vendored base model

- File: `model/fluxnova-kyc-onboarding.architecture.json`
- Upstream: `finos/architecture-as-code`,
  `examples/fluxnova/fluxnova-kyc-onboarding.architecture.json`
- Upstream commit: `0626cea3` (2026-11-10)
- Seeded as Hub demo data upstream
  (`calm-hub/mongo/init-mongo.js`, `calm-hub/nitrite/init-nitrite.sh`).
- sha256: `54a5d6066987cd41ffbaf5e8fb1e666a03816074c56aa8219111396abd2a4541`
- Status: 20 nodes, 28 relationships, 0 flows, no top-level `controls`
  array (nodes may carry inline `controls`; `interfaces` present on some
  services). Never modified by this POC — verify with
  `shasum -a 256 fluxnova-kyc-onboarding.architecture.json` at any time.
- `views/kyc-screening-effectiveness.decorator.json`: demo decorator authored
  for the POC (not upstream), consumed by the audit view. Lives next to the
  views: decorators resolve as sibling documents of the view.

- File: `model/ech-0122.architecture.json`
- Upstream: eCH-0122 V2.0.1, Architektur E-Government Schweiz (Verein eCH),
  `eCH-0122-2-0-1.archimate` from `eCH-0122-2-0-1.zip`
  (https://www.ech.ch/de/ech/ech-0122/2.0.0).
- eCH standards are free to use, share and develop
  ("unentgeltlich und uneingeschränkt genutzt, weiterverbreitet und
  weiterentwickelt werden"); converted, not redistributed as ArchiMate.
- Status: 155 nodes, 247 relationships, Archi layers preserved in node
  metadata (`archimate-layer`). Converted with
  `node tools/dist/archimate.js <eCH-0122-2-0-1.archimate>`.

- File: `model/ech-0122.architecture.json`
- Upstream: eCH-0122 V2.0.1, Architektur E-Government Schweiz (Verein eCH),
  converted from `eCH-0122-2-0-1.archimate`
  (https://www.ech.ch/de/ech/ech-0122/2.0.0).
- License: eCH standards are free to use, share and develop
  ("unentgeltlich und uneingeschränkt genutzt, weiterverbreitet und
  weiterentwickelt werden"). Converted to CALM, not redistributed as ArchiMate.
- Status: 155 nodes, 247 relationships, Archi layers preserved in node
  metadata (`archimate-layer`). Verify at any time by re-running
  `node tools/dist/archimate.js` on a fresh copy of the upstream file.
