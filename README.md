# Calm views — one model, three readers

**Hackathon Track:** Track 3 Features

**Team:** zeta — Andrés Antoniuk (solo)
First-class, named views over a CALM architecture: scoped, audience-tagged
lenses in sidecar `*.calm-view.json` documents, with zero presentation in the
schema. Evidence for `finos/architecture-as-code#2344`.

## What it does

One vendored upstream architecture
(`examples/fluxnova/fluxnova-kyc-onboarding.architecture.json`, 20 nodes,
28 relationships, never modified) rendered through five views: platform,
integration, audit, a derived neighborhood view, and a drill-down inside
view. Each view emits
scoped JSON (machine), static SVG (human diagram) and Markdown prose
(audit-readable scope, tables, excluded-with-reason).

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
```

Requirements: Node 18+. Zero runtime dependencies, offline reproducible,
no network. TypeScript port of a Python prototype; renders are
byte-identical between the two.

## Interactive demo (spike)

A spike of the consumption side lives on the `spike/view-selector` branch
of `jaab-tech/architecture-as-code` (fork, no upstream PR): a toolbar
dropdown in CALM Canvas lists the workspace `*.calm-view.json` sidecars
selecting the open document and filters the canvas to the active view
(listed ids plus relationship closure, same semantics as `validate`).
Same filter, third renderer — the TypeScript POC above stays the reference.

## Roadmap

This project was built during a time-boxed FINOS hackathon. After the event,
if the project continues:

1. Graduate `view.json` into the `calm-schema` pipeline as the next draft.
2. A Views tab or overlay in Hub UI as an extension, per the extensions
   framework, plus `docify --view` parity in the CLI.
3. Sidecar survival of a Canvas round-trip once upstream `#3637` merges.

## Contributing

Coding agents must follow `AGENTS.md`: DCO sign-off on every commit
(`git commit -s`), identity matching the author.

## License

Copyright 2026 FINOS

Distributed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).

SPDX-License-Identifier: [Apache-2.0](https://spdx.org/licenses/Apache-2.0)
