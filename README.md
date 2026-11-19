# Calm views: named selections over CALM architectures

**Hackathon track:** Track 3 Features

**Team:** zeta (Andrés Antoniuk, solo)

A view is a named selection over a [CALM](https://calm.finos.org) architecture. A view is a sidecar `*.calm-view.json` document. It names an audience and a filter. It has no presentation in the schema. This work is evidence for [finos/architecture-as-code#2344](https://github.com/finos/architecture-as-code/issues/2344).

A view selects. A renderer draws. This repository contains the view schema, the tools that validate and render views, and a Hub diagram lens that draws them. The Hub draws through [diagram lenses](https://calm.finos.org/extensions), such as C4 and EA layers (see [#3771](https://github.com/finos/architecture-as-code/pull/3771)). No upstream lens consumes a view yet.

The project decision is in [ADR-0001](poc/adrs/0001-named-views-as-sidecars.json). The local Hub deployment decision is in [ADR-0002](poc/adrs/0002-official-hub-ui-proxy.json).

## Why

I modeled with ArchiMate for years. ArchiMate is a common language with clear layers. Its files are tool XML, though. XML does not fit the as-code loop of diff, review and validation in build. I adopted LikeC4 next. Its model and views split works well: one model, as many views as readers need. Its limit is standardization. One vendor's DSL is a dialect. A bank should not build on a dialect.

Modernizing bank infrastructure means modeling systems that already exist. Those models are large. To test views on a real model, we used eCH-0122, the Swiss e-government reference architecture. Our import has 216 nodes and 287 relationships. Splitting a model into one architecture per team breaks the whole. The community is already moving toward a unified space (see Related work). Our position is this: treat the namespace as the architecture. Serve each reader with views over it. Carry rich metadata, such as maturity or lifecycle, in the model.

CALM is the answer for the model: a vendor-neutral standard with validation in the build. This project proposes one piece that is not defined yet. It proposes named, reviewable selections for readers, scales and questions. It builds on issues that the community already opened:

- first-class views ([#2344](https://github.com/finos/architecture-as-code/issues/2344)).
- layout and presentation as a separate document ([#2901](https://github.com/finos/architecture-as-code/issues/2901), closed as a duplicate of #2344).
- cross-document references ([#3624](https://github.com/finos/architecture-as-code/issues/3624)).
- shared identity ([calm-schema#27](https://github.com/finos/calm-schema/issues/27)).
- namespace stitching ([calm-schema#47](https://github.com/finos/calm-schema/issues/47)).

## What it does

The project defines a view document in [`poc/schema/view.json`](poc/schema/view.json). A view filters by id, type, metadata or control claim. It has no presentation properties. The project also provides these tools:

- `validate`: checks every view against the schema and resolves its filter.
- `render`: writes scoped JSON, a static SVG and Markdown for one view.
- `derive`: writes a derived view as a frozen snapshot with its provenance.
- `gallery`: builds a second, renderer-neutral consumer of the same views.
- `query`: answers reader questions, runs governance gates and emits LLM-ready context.
- `pack`: wraps a view as a `type: view` decorator for Hub transport.
- `archimate`: imports Archi tool models and keeps the layers in node metadata.
- `landingzone2calm`: imports a Terragrunt landing zone as a CALM architecture.
- the Hub diagram lens in `poc/hub-extensions/calm-views`.

The repository ships four models. Three are imported or vendored; the Fall Hackathon ZETA model adapts the CALM tooling architecture to describe this local demo. Sources and hashes are in `poc/PROVENANCE.md`.

| Model | Nodes | Relationships | Views |
|---|---|---|---|
| FluxNova KYC onboarding | 20 | 28 | 6, plus one multi-file view |
| eCH-0122 (Swiss e-government) | 216 | 287 | 3 |
| Multi-cloud landing zone | 295 | 450 | 5 |
| Fall Hackathon ZETA | 15 | 26 | 5 |

The ZETA model describes the local Hub demo and its seven flows. There are 20 view files in total, including the multi-file `all-actors` view.

## Quick start

```sh
make check
```

`make check` runs the tools suite, the lens extension suite and the seed script test. The tools targets fetch the pinned landing zone source first, because some importer tests read it. Single steps:

```sh
make validate        # check every view
make landingzone-views # regenerate the five multi-cloud views
make render          # write the local renders (generated, not versioned)
make gallery         # rebuild poc/renders/gallery.html
make query           # describe the audit view (smoke test)
make extension-test  # run the lens extension tests
```

Each target has a plain Node equivalent in `OPERATION.md`.
Renders are not versioned. Run `make render` before you open a render.

Requirements:

- Node 24. CI pins Node 24. The tools require Node 18 or later; the lens extension requires Node 20.9 or later.
- One runtime dependency: `yaml`, locked in `poc/tools/package-lock.json`.
- Package installation may need registry access. `make landingzone-source` and the Hub image build need network access. The tools can run offline after their dependencies and the pinned source are available.

The landing zone source is a clone of [`cloudon-one/multi-cloud-runway`](https://github.com/cloudon-one/multi-cloud-runway) at a pinned commit. `make landingzone-source` puts it in `.local/`. `make import-landingzone` regenerates the model file from that clone. The importer writes one file only. Its provenance is inline in the model. No sidecar file or views summary is written. Run `make landingzone-views` to regenerate the five view files from the model; the tools tests compare them with generator output.

## Renders are deterministic

`render` reads the date from `SOURCE_DATE_EPOCH` when it is set. The Makefile sets `SOURCE_DATE_EPOCH=1794873600`, which is 2026-11-17 00:00 UTC. The end-to-end test uses the same value. Renders from any day match when you use the same epoch.

## Integration surfaces

Views are files. Any tool can read them. Today:

- **Canvas (spike, patch):** `poc/vscode/view-selector.patch` adds a view dropdown, a canvas filter and drill-down. It ships with a prebuilt VSIX. The patch is not merged upstream.
- **Hub lenses:** the demo runs the local CALM Views lens and FINOS C4 and EA Layers lenses in the Hub Diagram tab. CALM Views supports drill-down, SVG and PNG export and a POC screen. The Hub backend uses the official `finos/calm-hub:main` image. A local Nginx proxy serves the patched UI bundle and forwards API requests to that official backend.
- **ArchiMate:** `archimate` imports Archi tool models and keeps the layers. It was tested on the eCH-0122 model.
- **Agents:** a view is the context unit for an agent. The 216-node model does not fit in a prompt. One view does. `query context` emits the header, the nodes, the relationships and the exclusions with reasons.
- **CLI gap:** `calm docify` has no `--view` flag. Views stay in this POC until the schema graduates ([#2344](https://github.com/finos/architecture-as-code/issues/2344)).

## Continuous integration

The workflow `.github/workflows/ci.yml` runs on push and on pull request. It has five jobs:

- `tools`: installs, builds and tests `poc/tools`. It validates every view. It runs two governance gates for the `auditors` audience: audit logging and data classification.
- `extension`: builds and tests the Hub lens extension.
- `hub-ui-proxy`: applies the pinned Hub UI patch, tests and builds the UI-only proxy. It does not build the Hub server.
- `lens-image`: validates the Compose configuration and builds the lens image.
- `dco`: checks that every new commit has a `Signed-off-by` line.

No job publishes an artifact or pushes to a registry. The workflow has not yet run on this branch.

## Local Hub demo

Narrated video demo (English, 3:52): https://youtu.be/FgxKLOsVypE

The demo runs a local CALM Hub with three diagram lenses. It is not production. The root `docker-compose.yml` starts six services:

- `mongodb`: the Hub data store, with a named volume.
- `views`: the lens service on port 8095, built from `poc/hub-extensions/calm-views/Dockerfile`.
- `c4`: the official FINOS C4 lens image.
- `ea-layers`: the official FINOS EA Layers lens image.
- `calmhub`: the official Hub backend, available inside the Compose network.
- `hub-ui`: the patched UI bundle on port 8080, with API requests proxied to `calmhub`.

`make hub-up` pulls the official Hub, C4 and EA Layers images, builds the UI-only proxy from the pinned Hub UI source and patch, then starts the services and seeds the models and ADRs. It does not build the Hub server. `OPERATION.md` describes each step. Typical targets:

```sh
make keys      # create development-only identity keys in .local/keys
make hub-up    # build patched UI assets, start official Hub and lens services, seed models and ADRs
make seed      # load the four models and two ADRs, write their Hub IDs to .local/hub-models.env (safe to repeat)
make hub-down  # stop and remove the containers. The data volume stays.
make hub-reset # stop the containers and DELETE the MongoDB data volume
```

The local UI proxy builds the patched React UI with Node and serves it in front of the official Hub backend. It does not rebuild the Hub server or run Maven.

`make seed` writes the Hub-assigned model IDs to `.local/hub-models.env`. The Compose views service and `make extension-start` load that file, so the POC screen links follow the IDs returned by the Hub.

`OPERATION.md` lists the other targets and the demo URLs.

## Multi-file views (experimental)

`for` accepts an array of model paths. Each file resolves with the same filter. Node ids carry their file as a namespace. For example, `ech-0122/kyc-database` stays separate from a node with the same name in another file. Two files do not share nodes yet. The same service in two files counts as two nodes until CALM defines shared identity ([calm-schema#27](https://github.com/finos/calm-schema/issues/27)). The view `all-actors` selects every actor in the KYC model and the eCH model. It selects 51 namespaced nodes. Renderers draw single-file views only.

In ISO 42010 terms ([ISO/IEC/IEEE 42010:2022](https://www.iso.org/standard/74393.html)):

| ISO 42010 concept | This project |
|---|---|
| viewpoint, stakeholder, concern | view, audience, description |
| view | `*.calm-view.json`: a selection with no presentation |
| model | the `*.architecture.json` file, unchanged |

## Related work

- [ArchiMate](https://www.opengroup.org/archimate-forum/archimate-overview) is an earlier common language with clear layers. Its files are tool XML. People cannot write, review or diff them by hand. CALM already considers ArchiMate through its [EA Layers extension](https://calm.finos.org/extensions/ea-layers). It adds readable JSON and validation in the build. The importer in this repository maps the layers across.
- [LikeC4](https://likec4.dev) is the model and views split that this project follows. It is one vendor's language. CALM standardizes the model side. Named views are still open in [#2344](https://github.com/finos/architecture-as-code/issues/2344).
- [#2344](https://github.com/finos/architecture-as-code/issues/2344) is open. This project follows its selection semantics. A separate view document was proposed in [#2901](https://github.com/finos/architecture-as-code/issues/2901). That issue closed as a duplicate, and the discussion continues in #2344. The sidecars here are a proof of concept for the same selection semantics. They are not a competing schema.

## Validation status

The latest `make check` passed after the ZETA model, views and ADR changes. The local Compose demo and patched UI proxy were also exercised manually. The CI workflow has not run on this branch:

- Latest `make check`: tools 77/77, lens extension 16/16 and seed 1/1 passed.
- `node dist/validate.js`: all 20 view files report OK.
- Both auditor coverage gates pass with zero violations.

Every node id in a view resolves against its model. Every excluded relationship names the reason for the exclusion. The project does not add data that the models do not contain.

## Roadmap

If the project continues after the hackathon, the next steps are:

1. Move `view.json` into the `calm-schema` pipeline as the next draft.
2. Add a Views tab or overlay to the Hub UI, as an extension. Add `docify --view` to the CLI.
3. Keep sidecars intact through a Canvas round trip. This needs an extension release that includes upstream [#3637](https://github.com/finos/architecture-as-code/pull/3637). Release 0.9.6 does not include it.
4. Blocked upstream, documented so the direction survives:
   - a unified model across files needs shared node identity ([calm-schema#27](https://github.com/finos/calm-schema/issues/27) and [#47](https://github.com/finos/calm-schema/issues/47)).
   - cross-document references need one format and one resolver ([#3624](https://github.com/finos/architecture-as-code/issues/3624)).
   - nested architecture examples are still wanted upstream ([#1568](https://github.com/finos/architecture-as-code/issues/1568)).

## What this is not

- It makes no upstream change. It adds sidecars and tools. The eCH-0122 model is corrected locally and the landing-zone model is generated locally; views do not edit their model files. `for` is relative and provisional ([#3624](https://github.com/finos/architecture-as-code/issues/3624)).
- It is not an upstream Hub feature. The lens is a local demo extension. `pack` produces the decorator format for transport.
- It has no `docify --view`. Per-view documents come from `render --format md`.
- It has no top-level controls. Views filter on the inline `controls` claims that the models already carry.

## Contributing

Coding agents must follow `AGENTS.md`. Every commit needs a DCO sign-off (`git commit -s`). The identity in the sign-off must match the author.

## License

Copyright 2026 FINOS

Distributed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).

SPDX-License-Identifier: [Apache-2.0](https://spdx.org/licenses/Apache-2.0)

The third-party models keep their own licenses and attribution. See `poc/PROVENANCE.md`.
