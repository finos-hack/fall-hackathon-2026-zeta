# Provenance

The repository keeps the source and license for each model. Three are imported or vendored; the Fall Hackathon ZETA model is adapted from an explicit upstream file to describe the local demo.

## KYC onboarding (demo model)

- File: `model/fluxnova-kyc-onboarding.architecture.json`
- Upstream: `finos/architecture-as-code`, `examples/fluxnova/fluxnova-kyc-onboarding.architecture.json` at commit `0626cea3` (2026-11-10). Chosen because it is also seeded as Hub demo data upstream.
- License: Apache-2.0 (upstream repo).
- Status: 20 nodes, 28 relationships, 0 flows. No top-level `controls` array. Nodes and relationships may carry inline `controls` (audit claims live there), and some services carry `interfaces`.
- sha256: `54a5d6066987cd41ffbaf5e8fb1e666a03816074c56aa8219111396abd2a4541`
- Verify at any time: `shasum -a 256 model/fluxnova-kyc-onboarding.architecture.json`. The POC never modifies this file.

## eCH-0122 (reference model)

- File: `model/ech-0122.architecture.json`
- Upstream: eCH-0122 V2.0.0, Architektur E-Government Schweiz (Verein eCH), converted from `eCH-0122-2-0-1.archimate` (shipped as `eCH-0122-2-0-1.zip`) (https://www.ech.ch/de/ech/ech-0122/2.0.0).
- License: eCH standards are free to use, share and develop ("unentgeltlich und uneingeschränkt genutzt, weiterverbreitet und weiterentwickelt werden", section 9 of the standard). Attribution: Verein eCH, Fachgruppe SEAC (contributors include Filippos Santas).
- Status: 216 nodes, 287 relationships. Archi layers preserved in node metadata (`archimate-layer`). Capabilities are kept as `capability` nodes.
- sha256: `1527e32c1ba1733ccdf36f5f81e8b56062d67ce93ec26e869090b44ef6566dc6`
- Verify at any time: re-run `node tools/dist/archimate.js` on a fresh copy of the upstream `.archimate` file.

## Multi-cloud landing zone (imported from Terragrunt)

- File: `model/multicloud-landing-zone.architecture.json`
- Source: https://github.com/cloudon-one/multi-cloud-runway
- Commit: `2fe49b9829df7a8749915ba1200896390d95139b`
- License: MIT
- Imported at: 2026-11-17T23:22:58+00:00
- Importer: `landingzone2calm 0.3.0` (`tools/src/landingzone2calm.ts`). Regenerate it with `make import-landingzone` after `make landingzone-source`.
- Status: 295 nodes, 450 relationships, AWS and GCP.
- sha256: `3e6a513fb9331c2319062cf715bb8acbafb238951ac7fb4f658c926c1b1a62a2`
- Verify at any time: `shasum -a 256 model/multicloud-landing-zone.architecture.json`. The importer writes only this model file. It keeps source URLs, commits, licenses, paths and hashes in CALM metadata. It writes no source sidecars or summary files.

The CALM model is a derivative of the source layout. It keeps the hierarchy, the resource inputs, the tags and the source paths. The source repository and its MIT licence remain the canonical source.

The source `ARCHITECTURE_REPORT.json` is kept as a source assessment. Its score is not a quality claim for this model or for the demo.

Adapted: regions and metadata are normalized for the views. The source files are not vendored into this repository.

## Fall Hackathon ZETA (local demo model)

- File: `model/fall-hackathon-zeta.architecture.json`
- Upstream: `finos/architecture-as-code`, [`calm-3.json`](https://github.com/finos/architecture-as-code/blob/e46aeeccbb626b3260dcfc3e615096e783bb7571/calm-3.json) at commit `e46aeeccbb626b3260dcfc3e615096e783bb7571`.
- License: Apache-2.0 (upstream repo).
- Adaptation: describes the local CALM Hub demo, including its services, endpoints and source links, Compose grouping and volumes, seed process, UI build stage, and seven model flows. It is not a copy of the upstream tooling architecture.
- Status: 15 nodes, 26 relationships and 7 flows.
- sha256: `44181c9cb2addcc5a29d19febf6defbdcb679486cb3ad9632bb207b7f9932ea9`
- The source file is linked above; this model is maintained as a local demo architecture.

## CALM 1.3 validation schemas

- Files: `schema/calm-1.3/{calm,core,control,flow,interface}.json`
- Source: [`finos/architecture-as-code`](https://github.com/finos/architecture-as-code), release 1.3 meta schemas published at `https://calm.finos.org/release/1.3/meta/`.
- License: Apache-2.0.
- Retrieved from the published release URL on 2026-11-18. The hosted release does not provide a source commit reference.
- sha256:
  - `calm.json`: `c4152260c37f3ff6d01b57570aff0e135d3a536f8b2c39c976239f623e9993c1`
  - `core.json`: `f1a4f5cc4f6a6f9787adc3fd4208771e8991f6e16913533bbda16b3ccb388066`
  - `control.json`: `753237161324cebdc488b095d27e4a71a37f72d659493740cd868328efd2456c`
  - `flow.json`: `47f38914fa32a3193c9ccd67ce7327ada0136e6093190820cc3d3ff53ce0c186`
  - `interface.json`: `ff68e0eec6939ecbc7b7b02a1f147350a3a09943c1e603c201f3a0137ad32807`
- Purpose: let the model tests validate every architecture against CALM 1.3 without fetching schemas at test time.

## POC-authored

- `views/kyc-onboarding/kyc-screening-effectiveness.decorator.json`: demo decorator, not upstream. Lives next to the views because decorators resolve as sibling documents of the view that consumes it.
