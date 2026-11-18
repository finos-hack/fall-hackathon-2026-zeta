# Deploy the calm-views Hub extension (local demo)

This is a hackathon spike, not production guidance. It runs the diagram lens, the POC screen and the landing card against a local CALM Hub.

## Build

Build the shared tools first (the lens imports them), then the extension. No `node_modules/` or `dist/` is committed; both are rebuilt.

```sh
# from the repo root
npm ci --prefix poc/tools && npm run build --prefix poc/tools
npm ci --prefix poc/hub-extensions/calm-views && npm run build --prefix poc/hub-extensions/calm-views
```

Run the tests the same way (`npm test` in each folder).

## Run the service

```sh
CALM_VIEWS_DIR=<repo>/poc/views PORT=8095 \
  npm start --prefix poc/hub-extensions/calm-views
```

Defaults: it listens on `127.0.0.1:8095`, reads sidecars from `poc/views` (models resolve to `poc/model`), and links the POC screen to `finos/architectures` ids 14 (multi-cloud, 1.0.0), 12 (KYC, 1.0.0) and 13 (eCH, 1.1.0). Override with `CALM_HUB_BASE_URL`, `CALM_VIEWS_PUBLIC_URL`, `CALM_POC_MODEL` and the `CALM_POC_*` variables (see `src/main.ts`).

## Wire it into CALM Hub (Docker)

Copy `extension.json` and `notation.json` into the directory Hub reads as `calm.extensions.dir` (the service does this itself when `CALM_VIEWS_EXPORT_DIR` points at it), and set, on the Hub container:

```sh
CALM_EXTENSIONS_DIR=/extensions
CALM_EXTENSIONS_ALLOW_WITHOUT_AUTH=true
CALM_EXTENSIONS_HTTP_MAX_REQUEST_BYTES=4194304
CALM_EXTENSIONS__CALM_VIEWS__ENABLED=true
CALM_EXTENSIONS__CALM_VIEWS__ALLOW_HTTP=true
CALM_EXTENSIONS__CALM_VIEWS__BACKEND_URL=http://host.docker.internal:8095
```

Then open the multi-cloud architecture in Hub, choose the **Views** lens in the Diagram tab, and read the **CALM views POC** screen.
