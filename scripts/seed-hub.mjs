#!/usr/bin/env node
// Seed the local Hub with the four demo models and one ADR; save their allocated IDs.
// Existing namespaces, architecture headers and versions are safe to reuse.
// Usage: node scripts/seed-hub.mjs [http://localhost:8080]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = [
    { key: 'KYC', name: 'FluxNova KYC onboarding', file: 'poc/model/fluxnova-kyc-onboarding.architecture.json', version: '1.0.0' },
    { key: 'ECH', name: 'eCH-0122', file: 'poc/model/ech-0122.architecture.json', version: '1.1.0' },
    { key: 'ARCHITECTURE', name: 'Multi-cloud landing zone', file: 'poc/model/multicloud-landing-zone.architecture.json', version: '1.0.0' },
    { key: 'ZETA', name: 'Fall Hackathon ZETA', file: 'poc/model/fall-hackathon-zeta.architecture.json', version: '1.0.0' },
];
const ADR_FILE = 'poc/adrs/0001-official-hub-ui-proxy.json';

async function request(base, path, method, body) {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : undefined;
    } catch {
        data = text;
    }
    if (!response.ok && response.status !== 409) {
        throw new Error(`${method} ${path}: HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    return { status: response.status, location: response.headers.get('location'), data };
}

function idFromLocation(location, base) {
    const url = new URL(location ?? '', base);
    const match = /\/architectures\/(\d+)\/versions\//.exec(url.pathname);
    if (!match) throw new Error(`Hub returned an invalid architecture Location: ${location}`);
    return match[1];
}

function adrIdFromLocation(location, base) {
    const url = new URL(location ?? '', base);
    const match = /\/adrs\/(\d+)(?:\/|$)/.exec(url.pathname);
    if (!match) throw new Error(`Hub returned an invalid ADR Location: ${location}`);
    return match[1];
}

export async function seedHub({
    baseUrl = 'http://localhost:8080',
    repoRoot = ROOT,
    envPath = process.env.CALM_POC_ENV_FILE ?? join(repoRoot, '.local', 'hub-models.env'),
    log = console.log,
} = {}) {
    const base = baseUrl.replace(/\/+$/, '');
    const namespaceResult = await request(base, '/api/calm/namespaces', 'POST', {
        name: 'finos',
        description: 'FINOS demo namespace',
    });
    log(`namespace finos: HTTP ${namespaceResult.status}`);

    const listArchitectures = async () => {
        const response = await request(base, '/api/calm/namespaces/finos/architectures', 'GET');
        const values = response.data?.values ?? response.data;
        if (!Array.isArray(values)) throw new Error('Hub returned no architecture list');
        return values;
    };

    const ids = {};
    for (const model of MODELS) {
        const document = readFileSync(join(repoRoot, model.file), 'utf8');
        let existing = (await listArchitectures()).find((item) => item.name === model.name);
        let id;
        if (existing) {
            id = String(existing.id);
        } else {
            const created = await request(base, '/api/calm/namespaces/finos/architectures', 'POST', {
                name: model.name,
                description: `${model.name} (seeded demo model)`,
                architectureJson: document,
            });
            if (created.status === 409) {
                existing = (await listArchitectures()).find((item) => item.name === model.name);
                if (!existing) throw new Error(`Hub reports a name conflict for ${model.name}, but no matching architecture exists`);
                id = String(existing.id);
            } else {
                id = idFromLocation(created.location, base);
            }
        }

        const versionsResponse = await request(base, `/api/calm/namespaces/finos/architectures/${id}/versions`, 'GET');
        const versions = versionsResponse.data?.values ?? [];
        if (!versions.includes(model.version)) {
            const createdVersion = await request(base, `/api/calm/namespaces/finos/architectures/${id}/versions/${model.version}`, 'POST', {
                name: model.name,
                description: `${model.name} (seeded demo model)`,
                architectureJson: document,
            });
            log(`finos/architectures/${id}/${model.version}: HTTP ${createdVersion.status}`);
        } else {
            log(`finos/architectures/${id}/${model.version}: exists`);
        }
        ids[model.key] = id;
    }

    const adrRequest = JSON.parse(readFileSync(join(repoRoot, ADR_FILE), 'utf8'));
    adrRequest.links = [
        { rel: 'Fall Hackathon ZETA model', href: `${base}/#/finos/architectures/${ids.ZETA}/1.0.0` },
        { rel: 'CALM Views POC', href: `${base}/#/extensions/calm-views/poc` },
    ];
    const listAdrs = async () => {
        const response = await request(base, '/api/calm/namespaces/finos/adrs', 'GET');
        const values = response.data?.values ?? response.data;
        if (!Array.isArray(values)) throw new Error('Hub returned no ADR list');
        return values;
    };
    let existingAdr = (await listAdrs()).find((item) => item.title === adrRequest.title || item.adr?.title === adrRequest.title);
    let adrId;
    if (existingAdr) {
        adrId = String(existingAdr.id);
        log(`finos/adrs/${adrId}: exists`);
    } else {
        const createdAdr = await request(base, '/api/calm/namespaces/finos/adrs', 'POST', adrRequest);
        if (createdAdr.status === 409) {
            existingAdr = (await listAdrs()).find((item) => item.title === adrRequest.title || item.adr?.title === adrRequest.title);
            if (!existingAdr) throw new Error(`Hub reports an ADR conflict for '${adrRequest.title}', but no matching ADR exists`);
            adrId = String(existingAdr.id);
        } else {
            adrId = adrIdFromLocation(createdAdr.location, base);
        }
        log(`finos/adrs/${adrId}: HTTP ${createdAdr.status}`);
    }
    ids.ADR = adrId;

    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, [
        'CALM_HUB_BASE_URL=http://localhost:8080',
        'CALM_VIEWS_PUBLIC_URL=http://localhost:8095',
        'CALM_POC_NAMESPACE=finos',
        `CALM_POC_KYC=${ids.KYC}`,
        'CALM_POC_KYC_VERSION=1.0.0',
        `CALM_POC_ECH=${ids.ECH}`,
        'CALM_POC_ECH_VERSION=1.1.0',
        `CALM_POC_ARCHITECTURE=${ids.ARCHITECTURE}`,
        'CALM_POC_VERSION=1.0.0',
        `CALM_POC_ZETA=${ids.ZETA}`,
        'CALM_POC_ZETA_VERSION=1.0.0',
        `CALM_POC_ADR=${ids.ADR}`,
        '',
    ].join('\n'), 'utf8');
    log(`wrote POC link settings to ${envPath}`);
    return ids;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    seedHub({ baseUrl: process.argv[2] ?? 'http://localhost:8080' })
        .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        });
}
