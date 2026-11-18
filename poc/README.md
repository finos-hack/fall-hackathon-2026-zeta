# poc: CALM views, reference implementation

The reference implementation is in TypeScript. It runs offline. It has one runtime dependency, `yaml`. A view selects by id, node type, node metadata or control claim. A view has no presentation in the schema. The `for` field is relative and provisional.

## Folders

- `model/`: four architecture files. Three are converted or imported from named sources; the Fall Hackathon ZETA file adapts the CALM tooling architecture to describe the local demo. Sources and hashes are in `PROVENANCE.md`.
  - `fluxnova-kyc-onboarding.architecture.json`: 20 nodes, 28 relationships.
  - `ech-0122.architecture.json`: 216 nodes, 287 relationships. It is the Swiss e-government reference architecture, eCH-0122 V2.0.0. Verein eCH publishes it. The standard allows free use, sharing and development, with attribution.
  - `multicloud-landing-zone.architecture.json`: 295 nodes, 450 relationships. It was imported from an MIT-licensed Terragrunt landing zone.
  - `fall-hackathon-zeta.architecture.json`: 15 nodes, 26 relationships and seven flows for the local Hub demo.
- `schema/view.json`: the view schema. It has filter properties only. It has optional `suggested-formats`, which is a non-normative hint, and optional `derived-from` provenance. It is a proof of concept. It is not a standard.
- `views/`: twenty `*.calm-view.json` files, grouped by model.
  - `kyc-onboarding/`: platform, integration, audit, the screening neighborhood (derived), the platform inside view (the drill-down target), the audit logging coverage view and the decorator used by the audit view.
  - `ech-0122/`: business, application and capabilities views.
  - `multicloud-landing-zone/`: global, cloud, region, environment and layer views.
  - `fall-hackathon-zeta/`: overview, Docker Compose runtime, lens services and seeding views.
  - `all-actors.calm-view.json`: a multi-file view over the KYC and eCH models.
- `adrs/`: the Hub UI proxy architecture decision record.
- `views/fall-hackathon-zeta-flows.calm-view.json`: the flows view for the ZETA demo model.
- `tools/`: validate, render, derive, gallery, query, pack, archimate and landingzone2calm.
- `hub-extensions/calm-views/`: the Hub diagram lens and its lens service.
- `vscode/`: the Canvas view selector patch and the prebuilt VSIX.
- `renders/`: generated output. It is not versioned. Run `make render` to create it.

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

`unique-id` names the view. `audience` says who reads it. `for` points to the model. It can be one path, or an array of paths for a multi-file view. `filter` selects nodes by id, by node type, by node metadata or by control claim. Relationships close over the selected nodes. Dangling endpoints are excluded, and each exclusion gives a reason. An optional `architecture` field names the model by its `unique-id`. Use it when the document has no `$id`, for example when the document comes from CALM Hub.

## Commands

From the repository root:

```sh
cd poc/tools && npm ci && npm run build && cd ../..
node poc/tools/dist/validate.js
node poc/tools/dist/render.js poc/views/kyc-onboarding/kyc-audit.calm-view.json --out poc/renders/kyc-onboarding
node poc/tools/dist/derive.js poc/model/fluxnova-kyc-onboarding.architecture.json \
  kyc-sanctions-screening-svc --depth 1 \
  --id kyc-screening-neighborhood --name "Screening Neighborhood (derived)" \
  --audience risk-analysts
node poc/tools/dist/gallery.js --out poc/renders
```

`OPERATION.md` lists the Make targets and the Hub demo.

## Validation results

`validate` checks each view against the schema and resolves its filter. All 20 current view files validate. The counts are nodes and relationships in each view:

| View | Nodes | Relationships |
|---|---|---|
| kyc-audit | 12 | 14 |
| kyc-platform | 14 | 22 |
| kyc-integration | 10 | 9 |
| kyc-platform-inside | 6 | 5 |
| kyc-screening-neighborhood | 4 | 3 |
| kyc-audit-logging | 4 | 3 |
| ech-application | 50 | 54 |
| ech-business | 100 | 122 |
| ech-capabilities | 61 | 9 |
| multicloud-global | 18 | 43 |
| multicloud-cloud | 2 | 0 |
| multicloud-region | 4 | 3 |
| zeta-overview | 15 | 26 |
| zeta-runtime | 9 | 18 |
| zeta-extensions | 8 | 16 |
| zeta-seeding | 8 | 16 |
| all-actors (two files) | 51 | 46 in file |
| fall-hackathon-zeta-flows | 15 | 26 |

The views `multicloud-environment` and `multicloud-layer` need a parameter (`--set env=...` or `--set layer=...`). Without it, they show no nodes.

## Determinism

`render` uses the date from `SOURCE_DATE_EPOCH` when it is set. The end-to-end test sets it, so the outputs match on any day. `render` and `validate` never write to `model/`. Importers write generated models only when you run them; the ZETA demo model is maintained separately.
