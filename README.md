# Calm views — named selections over CALM architectures

**Hackathon Track:** Track 3 Features

**Team:** zeta — Andrés Antoniuk (solo)
First-class, named views over a [CALM](https://calm.finos.org) architecture: scoped, audience-tagged
selections in sidecar `*.calm-view.json` documents, with zero presentation
in the schema. Evidence for [finos/architecture-as-code#2344](https://github.com/finos/architecture-as-code/issues/2344).

The focus of this work is not tooling for its own sake. The tools exist
to surface the views question and make it reviewable: every claim below
is backed by a file the judges can open, run, and diff.
A view selects, a renderer draws. The Hub draws through [diagram
lenses](https://calm.finos.org/extensions) such as C4 and EA layers (see
[#3771](https://github.com/finos/architecture-as-code/pull/3771)).
No lens consumes a view yet.

## Why

I modeled with ArchiMate for years. It is excellent: a common language
with clear layers. But its files are tool XML, and the as-code loop
(diff, review, validate in build) does not fit XML. I adopted LikeC4
next. The model/views split works: one model, as many views as readers
need. Its limit is standardization. One vendor's DSL is a dialect, and
a bank should not build on a dialect.

Modernizing bank infrastructure means modeling systems that already
exist. Those models are usually big. To validate views on a real one,
we looked for an existing model with public access and found eCH-0122,
the Swiss e-government reference architecture: our import has 216
nodes and 287 relationships. Slicing them into separate architectures
per team breaks
the whole, and the community is already moving toward a unified space
(see Related work below). Our position: treat the namespace as the
architecture, and serve every reader with views over it, carrying rich
metadata such as maturity or lifecycle.
That is why CALM is the answer: a vendor-neutral standard for the model,
with validation in the build. This project proposes one piece of the
missing side, named and reviewable selections for readers, scales and
questions, building on issues the community already opened: first-class
views ([#2344](https://github.com/finos/architecture-as-code/issues/2344)),
the separate-document discussion ([#2901](https://github.com/finos/architecture-as-code/issues/2901)),
cross-document references ([#3624](https://github.com/finos/architecture-as-code/issues/3624)),
shared identity ([calm-schema#27](https://github.com/finos/calm-schema/issues/27))
and namespace stitching ([#47](https://github.com/finos/calm-schema/issues/47)).

## What it does

This project defines a view document (`poc/schema/view.json`: audience,
filter by id, type, metadata or control claims, zero presentation) and
the tools and use cases around it: `validate`, `render`, `derive`,
`gallery`, reader queries (`query.js`), governance gates
(`coverage --require`), Hub transport (`pack.js`) and ArchiMate import.

To demonstrate it on existing architectures, two vendored models ship
with the repo, never modified. The KYC onboarding model
(`examples/fluxnova/fluxnova-kyc-onboarding.architecture.json`, 20 nodes,
28 relationships) renders through six views: platform, integration,
audit, a derived neighborhood view, a drill-down inside view, and an
audit-logging coverage view over the model's real control claims. The
Swiss e-government reference eCH-0122 (216 nodes, redistributable, chosen
because it is a public, validated, official architecture) ships with
layer and capability views. Each view emits scoped JSON
(machine), static SVG (human diagram) and Markdown prose (audit-readable
scope, tables, excluded-with-reason).

## Usage example

```sh
cd poc/tools && npm install && npm run build && cd ../..
node poc/tools/dist/validate.js            # all views must report OK
node poc/tools/dist/render.js poc/views/kyc-audit.calm-view.json
node poc/tools/dist/derive.js poc/model/fluxnova-kyc-onboarding.architecture.json \
  kyc-sanctions-screening-svc --depth 1 \
  --id kyc-screening-neighborhood --name "Screening Neighborhood (derived)" \
  --audience risk-analysts
node poc/tools/dist/gallery.js             # second consumer: poc/renders/gallery.html
node poc/tools/dist/query.js describe-view kyc-audit-view   # reader query
node poc/tools/dist/query.js coverage                       # per-view coverage
node poc/tools/dist/query.js coverage --require audit-logging auditors  # governance gate
node poc/tools/dist/query.js context kyc-audit-view        # LLM-ready bundle: header + nodes + rels + exclusions
node poc/tools/dist/pack.js poc/views/kyc-audit.calm-view.json --arch-id kyc-arch  # pack for Hub transport (the Hub has no views surface today)
```

Requirements: Node 18+. Zero runtime dependencies, offline reproducible,
no network. Renders are byte-identical across runs.

## Interactive demo (spike)

A spike of the consumption side lives on the `spike/view-selector` branch
of `jaab-tech/architecture-as-code` (fork, no upstream PR): a toolbar
dropdown in CALM Canvas lists the workspace `*.calm-view.json` sidecars
selecting the open document and filters the canvas to the active view
(listed ids plus relationship closure, same semantics as `validate`).
Same filter, third renderer. The TypeScript POC above stays the reference.

## Integration surfaces

Views are files, so any tool can consume them. What exists today:

- **Canvas** (spike, fork): dropdown, canvas filter, drill-down.
  Same semantics as `validate`.
- **Hub**: `pack.js` wraps a sidecar as a `type: view` decorator, which
  the Hub MCP serves. The Hub has no views surface today, so this is
  transport format, not integration yet.
- **ArchiMate**: `archimate.js` imports Archi tool models, preserving
  layers in node metadata. A standard translated into working software,
  shown on the real eCH-0122 model (155 nodes) to prove that views scale
  to complex architectures.
- **CLI gap**: `calm docify` has no `--view` flag. Views stop at the POC
  until the schema graduates ([#2344](https://github.com/finos/architecture-as-code/issues/2344)).
- **Agents**: a view is the context unit for an agent. A 216-node model
  does not fit a prompt. One view does (`query.js context` emits the
  bundle with header, nodes, relationships and exclusions with reason).

## Multi-file views (experimental)

`for` accepts an array of model paths. Each file resolves independently
with the same filter. Node ids carry their file as namespace
(`ech-0122/kyc-database` stays two nodes when two files use the name).
No deduplication is claimed: the same service in two files is two nodes
until CALM defines shared identity ([calm-schema#27](https://github.com/finos/calm-schema/issues/27)).
Example: `all-actors` selects every actor node across the KYC model and
the eCH model (51 namespaced nodes). Renderers stay single-file.

In ISO 42010 terms ([ISO/IEC/IEEE 42010:2022](https://www.iso.org/standard/74393.html)):

| 42010 | This project |
|---|---|
| viewpoint / stakeholder / concern | view / audience / description |
| view | `*.calm-view.json` (selection, zero presentation) |
| model | the untouched `*.architecture.json` |

## Related work

- [ArchiMate](https://www.opengroup.org/archimate-forum/archimate-overview):
  the earlier attempt at a common language, with clear layers. Its limit
  is tool XML that humans cannot write, review or diff by hand. CALM keeps
  the discipline and adds readable JSON plus build-time validation. The
  importer in this repo proves the bridge on a real model (eCH-0122).
- [LikeC4](https://likec4.dev): the model/views split this project imitates.
  One model, as many views as readers need. Its limit is being one
  vendor's language. A bank should not build on a dialect. CALM standardizes
  the model side. Named views are still open ([#2344](https://github.com/finos/architecture-as-code/issues/2344)).
- [finos/architecture-as-code#2344](https://github.com/finos/architecture-as-code/issues/2344):
  first-class views, open. Our filter mirrors its proposed selection
  semantics. A separate view document was proposed in [#2901](https://github.com/finos/architecture-as-code/issues/2901)
  and closed in favor of inline views. Our sidecars are the POC vehicle
  for the same selection semantics, not a rival schema.

## How this was built

With AI coding agents under human direction and review: research and
upstream surveillance, test design, and rubric review ran as separate
agent roles, and every claim above was verified by hand (clean-clone
install, byte-identical renders, DCO on every commit). No data is
invented: every node id resolves against the vendored architecture,
and every exclusion names its reason.

## Roadmap

This project was built during a time-boxed FINOS hackathon. After the event,
if the project continues:

1. Graduate `view.json` into the `calm-schema` pipeline as the next draft.
2. A Views tab or overlay in Hub UI as an extension, per the extensions
   framework, plus `docify --view` parity in the CLI.
3. Sidecar survival of a Canvas round-trip in an extension release shipping
   upstream [#3637](https://github.com/finos/architecture-as-code/pull/3637) (merged 2026-11-16, not yet in 0.9.6).
4. Wishlist, blocked upstream, documented here so the direction survives
   the hackathon: a unified model across files needs shared node identity
   ([calm-schema#27](https://github.com/finos/calm-schema/issues/27),
   overlapping with [#47](https://github.com/finos/calm-schema/issues/47)).
   Until then, multi-file views stay a namespaced union without dedup.
   Cross-document references need one format and one resolver
   ([#3624](https://github.com/finos/architecture-as-code/issues/3624)).
   Nested-architecture examples are still wanted upstream
   ([#1568](https://github.com/finos/architecture-as-code/issues/1568)).

## What this is not

- No upstream changes: sidecars and tools only, the model file is never
  modified. `for` is relative and provisional ([#3624](https://github.com/finos/architecture-as-code/issues/3624)).
- No Hub surface: `pack` produces the decorator format, but the Hub has
  no views tab. Transport, not integration.
- No `docify --view`: per-view documents come from `render --format md`.
  CLI parity belongs upstream.
- No top-level controls: views filter on the inline `controls` claims
  the model already carries. Nothing is invented.

## Contributing

Coding agents must follow `AGENTS.md`: DCO sign-off on every commit
(`git commit -s`), identity matching the author.

## License

Copyright 2026 FINOS

Distributed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).

SPDX-License-Identifier: [Apache-2.0](https://spdx.org/licenses/Apache-2.0)
