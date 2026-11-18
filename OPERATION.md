# Operation runbook

This file explains how to run, check and demonstrate this repository.
The table lists the main check and build targets, their prerequisites and their recipes.

## Prerequisites

- Node 24. CI pins Node 24. The tools require Node 18 or later; the lens extension
  requires Node 20.9 or later.
- Docker, for the local Hub demo and its Node and Maven build containers.
- Free ports: 8080 (Hub) and 8095 (views lens service).
- Network access on the first `make hub-up`. The build clones `finos/architecture-as-code`
  at a pinned commit.

## Repository map

- `poc/model/`: three architecture files, one for each model. Nothing else is in this folder.
  The landing zone file is written by `make import-landingzone` only.
  - `fluxnova-kyc-onboarding.architecture.json`: the FluxNova KYC model.
  - `ech-0122.architecture.json`: the eCH-0122 model, converted from ArchiMate.
  - `multicloud-landing-zone.architecture.json`: the landing zone, imported from Terragrunt.
- `poc/views/`: sixteen `*.calm-view.json` files, grouped by model:
  - `kyc-onboarding/`: seven files, including the decorator that the audit view uses.
  - `ech-0122/`: three views.
  - `multicloud-landing-zone/`: five views.
  - `all-actors.calm-view.json` and `calm-3-flows.calm-view.json`: at the top level.
- `poc/renders/`: generated output. It is not versioned. Run `make render` to create it.
- `poc/tools/`: validate, render, derive, gallery, query, pack, the ArchiMate importer
  and the landing zone importer.
- `poc/hub-extensions/calm-views/`: the Hub diagram lens, the POC screen and the
  Dockerfile for the lens service. Its `DEPLOY.md` describes the deployment.
- `poc/vscode/`: the Canvas view selector patch and the prebuilt VSIX.
- `scripts/seed-hub.mjs`: loads the three models into the Hub.
- `scripts/build-hub-image.sh`: builds the demo Hub image from the pinned upstream commit and the UI patch.
- `docker-compose.yml`: the local demo stack (Hub, views lens and MongoDB).
- `Makefile`: one target per job. Run `make help` for the list.

## Checks

Run all checks with one command:

```sh
make check
```

It runs the tools suite (68 tests), the lens extension suite (15 tests) and the seed script test (1 test).
The `tools` and `tools-test` targets build the tools, fetch the landing zone source, then run the tests.
Some importer tests read that source.

| Make target | Prerequisites and recipe |
|---|---|
| `make landingzone-source` | clones the pinned landing zone source into `.local/multi-cloud-runway` |
| `make tools-build` | `cd poc/tools && npm ci && npm run build` |
| `make tools` | runs `tools-build`, then `landingzone-source`, then `cd poc/tools && npm test` |
| `make seed-test` | `node --test scripts/seed-hub.test.mjs` |
| `make check` | runs `tools`, `extension-test` and `seed-test` |
| `make import-landingzone` | runs `tools-build` and `landingzone-source`, then `cd poc/tools && SOURCE_DATE_EPOCH=1794957778 node dist/landingzone2calm.js --source ../../.local/multi-cloud-runway --out ../model` |
| `make validate` | runs `tools-build`, then `cd poc/tools && node dist/validate.js` |
| `make render` | runs `tools-build`, then the render commands below |
| `make gallery` | runs `render`, then `cd poc/tools && node dist/gallery.js --out ../renders` |
| `make query` | runs `tools-build`, then `cd poc/tools && node dist/query.js describe-view kyc-audit-view` |
| `make extension-test` | runs `tools-build`, then `cd poc/hub-extensions/calm-views && npm ci && npm run build && npm test` |

The CI workflow runs these checks in five jobs:

- `tools`: builds, tests and validates `poc/tools`. It also runs two governance gates for
  the `auditors` audience: `coverage --require audit-logging auditors` and
  `coverage --require data-classification auditors`.
- `extension`: builds and tests the lens extension.
- `hub-image`: tests the Hub UI patch, runs the Hub server tests and builds the local Hub image.
- `lens-image`: validates the Compose configuration and builds the lens image.
- `dco`: checks that each new commit has a `Signed-off-by` line.

The workflow runs on push and on pull request. It has not yet run on this branch.

## Landing zone source

`make landingzone-source` clones `cloudon-one/multi-cloud-runway` into `.local/multi-cloud-runway`
at commit `2fe49b9829df7a8749915ba1200896390d95139b`. It writes a marker file next to the clone.
It refuses to use a directory that it did not create, and it refuses a clone with local changes.

`make import-landingzone` reads that clone and writes `poc/model/multicloud-landing-zone.architecture.json`.
It uses the fixed date `SOURCE_DATE_EPOCH=1794957778` (2026-11-17 23:22:58 UTC). The importer writes
that one file. It writes no sidecar, no views summary and no separate provenance file.
The expected sha256 of the model is `3e6a513fb9331c2319062cf715bb8acbafb238951ac7fb4f658c926c1b1a62a2`.
It matches `poc/PROVENANCE.md`.

## Renders

`render` uses the date from `SOURCE_DATE_EPOCH`. The Makefile sets it to
`1794873600`, which is 2026-11-17 00:00 UTC. Run the same command on any day to get the
same output:

```sh
cd poc/tools
SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/kyc-onboarding/kyc-audit.calm-view.json --out ../renders/kyc-onboarding
```

Two views need a parameter to show nodes. Pass it with `--set`:

- `multicloud-environment` needs `--set env=prod`.
- `multicloud-layer` needs `--set layer=network`.

Without the parameter, both views have no nodes. `render` draws single-file views only.
The views `all-actors` and `calm-3-flows` have no renders.

## Lens service

```sh
make extension-start
```

The service listens on `http://127.0.0.1:8095`. It reads views from `poc/views`.
Run it while the Hub Views lens is open. Without it, the lens returns errors.

## Hub demo

### Hub image

`make hub-build` runs `scripts/build-hub-image.sh`. The script does these steps:

1. Clones `finos/architecture-as-code` and checks out the pinned commit
   `e46aeeccbb626b3260dcfc3e615096e783bb7571`.
2. Applies `poc/hub-ui/view-lens-ui.patch` to that checkout.
3. Builds the Hub UI in a Node 26 container with `npm run calm-hub-ui:prod`.
4. Runs all Hub server tests and packages the Hub in a Maven 3.9.16 and Java 21 container with
   `./mvnw -B -Pserver-only clean package`.
5. Builds the image `calm-hub:zeta` from the Hub's Dockerfile.

The clone is kept in `.local/architecture-as-code-build/`. The script resets that clone only
when a marker file shows that the script created it. If the directory belongs to someone
else, the script stops. Move that directory away, then run `make hub-build` again.

`make hub-up` rebuilds the Hub image each time. It then starts MongoDB and the Hub,
seeds the models, writes their allocated IDs, and starts the lens service. The upstream image
`finos/calm-hub:main` does not include the patch, so the demo does not work with it.

### Steps

```sh
make hub-up
make hub-status
```

The other targets are `hub-build`, `hub-start`, `hub-stop`, `hub-down` and `hub-logs`.
`make hub-build` builds only the Hub image. `make keys` creates development-only keys in `.local/keys`.
The private key has mode `0644` so the Hub container can read the bind mount. The key stays in
the ignored `.local/` directory and is only for this local demo.
`make seed` loads the models and refreshes the POC links without rebuilding the Hub image.
`hub-down` removes the containers. The MongoDB volume stays.
`hub-reset` removes the containers and the MongoDB volume. All Hub data is lost. Use it only
to start the demo from an empty database.

`make seed` loads eCH-0122 as version 1.1.0. The POC links to version 1.1.0.

### Demo URLs

`make seed` assigns the Hub IDs and writes them to `.local/hub-models.env`. The views service reads
that file, and the POC screen uses those IDs automatically. To make a direct URL, replace the ID
placeholder with the matching value from the env file:

- Multi-cloud drill-down:
  `http://localhost:8080/#/finos/architectures/<CALM_POC_ARCHITECTURE>/<CALM_POC_VERSION>?lens=views&view=multicloud-global`
- KYC audit view:
  `http://localhost:8080/#/finos/architectures/<CALM_POC_KYC>/<CALM_POC_KYC_VERSION>?lens=views&view=kyc-audit-view`
- eCH application layer:
  `http://localhost:8080/#/finos/architectures/<CALM_POC_ECH>/<CALM_POC_ECH_VERSION>?lens=views&view=ech-application`
- POC screen: `http://localhost:8080/#/extensions/calm-views/poc`

In the lens, click a node to select it. A node with a drill-down view has a separate view badge;
click the badge to open the next view. The key explains the node markers.


## Troubleshooting

- **Port 8095 is busy.** Only one lens service can listen there.
  Run `lsof -nP -iTCP:8095 -sTCP:LISTEN` to find the owner.
- **The page shows an old interface after a rebuild.** The browser caches the page.
  Reload the page, or open a new private window.
- **A view shows a warning that it is not defined.** The Hub kept the view name from the
  previous architecture. Choose a view from the View list.
- **The eCH architecture shows that it is not valid CALM.** Select version 1.1.0.
  Version 1.0.0 uses an older converter output.
