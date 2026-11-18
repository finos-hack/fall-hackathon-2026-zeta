import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createViewsServer, exportExtension } from './server.js';
import { defaultViewsDir } from './paths.js';

const env = process.env;
const port = Number(env.PORT ?? 8095);
const host = env.HOST ?? '127.0.0.1';
const here = dirname(fileURLToPath(import.meta.url));
const viewsDir = env.CALM_VIEWS_DIR ?? defaultViewsDir(here);

if (!existsSync(viewsDir)) {
    mkdirSync(join(here, '..', 'views-bundle'), { recursive: true });
}

if (env.CALM_VIEWS_EXPORT_DIR) {
    console.log(`copied the extension folder to ${await exportExtension(env.CALM_VIEWS_EXPORT_DIR)}`);
}

createViewsServer({
    viewsDir,
    exportBaseUrl: env.CALM_VIEWS_PUBLIC_URL ?? `http://localhost:${port}`,
    poc: {
        modelPath: env.CALM_POC_MODEL,
        hubBaseUrl: env.CALM_HUB_BASE_URL || undefined,
        links: {
            namespace: env.CALM_POC_NAMESPACE ?? 'finos',
            architectureId: env.CALM_POC_ARCHITECTURE ?? '14',
            architectureVersion: env.CALM_POC_VERSION ?? '1.0.0',
            kycId: env.CALM_POC_KYC ?? '12',
            kycVersion: env.CALM_POC_KYC_VERSION ?? '1.0.0',
            echId: env.CALM_POC_ECH ?? '13',
            echVersion: env.CALM_POC_ECH_VERSION ?? '1.1.0',
            zetaId: env.CALM_POC_ZETA ?? '15',
            zetaVersion: env.CALM_POC_ZETA_VERSION ?? '1.0.0',
            adrViewsId: env.CALM_POC_ADR_VIEWS ?? '1',
            adrProxyId: env.CALM_POC_ADR_PROXY ?? env.CALM_POC_ADR ?? '2',
        },
    },
}).listen(port, host, () =>
    console.log(`Views lens service on http://${host}:${port}, reading sidecars from ${viewsDir}`)
);
