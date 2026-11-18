import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listViewFiles } from '../../../tools/dist/calm.js';

export interface PocLinks {
    namespace: string;
    architectureId: string;
    architectureVersion: string;
    kycId: string;
    kycVersion: string;
    echId: string;
    echVersion: string;
}

export interface PocScreenConfig {
    modelPath?: string;
    links?: Partial<PocLinks>;
    /** Browser-reachable Hub base URL for the markdown links. */
    hubBaseUrl?: string;
}

export interface PocScreenReply {
    hubApi: 0;
    title: string;
    blocks: Record<string, unknown>[];
}

const SOURCE_URL = 'https://github.com/cloudon-one/multi-cloud-runway';
const SOURCE_COMMIT = '2fe49b9829df7a8749915ba1200896390d95139b';
const IMPORTER_VERSION = '0.3.0';

function modelCounts(modelPath: string, fallbackNodes: number, fallbackRelationships: number): { nodes: number; relationships: number } {
    if (!existsSync(modelPath)) return { nodes: fallbackNodes, relationships: fallbackRelationships };
    try {
        const model = JSON.parse(readFileSync(modelPath, 'utf8')) as { nodes?: unknown[]; relationships?: unknown[] };
        return {
            nodes: Array.isArray(model.nodes) ? model.nodes.length : fallbackNodes,
            relationships: Array.isArray(model.relationships) ? model.relationships.length : fallbackRelationships,
        };
    } catch {
        return { nodes: fallbackNodes, relationships: fallbackRelationships };
    }
}

function viewCount(viewsDir: string): number {
    try {
        return listViewFiles(viewsDir).length;
    } catch {
        return 0;
    }
}

function hubUrl(hubBase: string, namespace: string, id: string, version: string): string {
    return `${hubBase.replace(/\/+$/, '')}/#/${namespace}/architectures/${id}/${version}`;
}

function hubArchUrl(hubBase: string, links: PocLinks, id: string, version: string): string {
    return hubUrl(hubBase, links.namespace, id, version);
}

/** The home card and the screen that defend the POC inside CALM Hub. One markdown document. */
export function pocScreen(viewsDir: string, config: PocScreenConfig = {}): PocScreenReply {
    const modelPath = config.modelPath ?? join(viewsDir, '..', 'model', 'multicloud-landing-zone.architecture.json');
    const counts = modelCounts(modelPath, 295, 450);
    const kycCounts = modelCounts(join(viewsDir, '..', 'model', 'fluxnova-kyc-onboarding.architecture.json'), 20, 28);
    const echCounts = modelCounts(join(viewsDir, '..', 'model', 'ech-0122.architecture.json'), 216, 287);
    const views = viewCount(viewsDir);
    const links: PocLinks = {
        namespace: 'finos',
        architectureId: '14',
        architectureVersion: '1.0.0',
        kycId: '12',
        kycVersion: '1.0.0',
        echId: '13',
        echVersion: '1.1.0',
        ...config.links,
    };
    const hubBase = (config.hubBaseUrl ?? 'http://localhost:8080').replace(/\/+$/, '');
    const text = [
        '> Internal hackathon spike. The model and the views live in this Hub instance; nothing is published to FINOS.',
        '',
        '## Challenges',
        `1. **Scale:** a real architecture is too large to show at once. The multi-cloud model already has ${counts.nodes} nodes and ${counts.relationships} relationships.`,
        '2. **Audience:** the same model has to answer different questions for architects, platform engineers, operations and compliance. Each reader needs a different part of it.',
        '3. **Separation:** some views must be separated by function, not only by size. Mixing network, security, data and compute makes every question harder to answer.',
        '',
        'One picture cannot answer all three. One model can feed many named views.',
        '',
        '## The proposal',
        'One model, many named views. A view is a filter, not a copy. The model file never changes; the reader gets one question at a time. The same sidecar views drive the Hub diagram lens, the Canvas extension and the command-line renderers.',
        '',
        `3 validation models, ${views} named views, 2 import tools, 3 Hub extension points.`,
        '',
        '## Three models',
        '',
        'The demo uses three different models. The same views, lens and export run on all three.',
        '',
        '| Model | Origin | Nodes | Relationships | Model file | Source | Commit | License | Importer |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        `| [FluxNova KYC onboarding](${hubArchUrl(hubBase, links, links.kycId, links.kycVersion)}) | Native CALM | ${kycCounts.nodes} | ${kycCounts.relationships} | fluxnova-kyc-onboarding.architecture.json | — | — | — | — |`,
        `| [eCH-0122](${hubArchUrl(hubBase, links, links.echId, links.echVersion)}) | Imported from ArchiMate | ${echCounts.nodes} | ${echCounts.relationships} | ech-0122.architecture.json | ArchiMate model | — | — | archimate.ts |`,
        `| [Multi-cloud landing zone](${hubArchUrl(hubBase, links, links.architectureId, links.architectureVersion)}) | Imported from Terragrunt | ${counts.nodes} | ${counts.relationships} | multicloud-landing-zone.architecture.json | [multi-cloud-runway](${SOURCE_URL}) | ${SOURCE_COMMIT} | MIT | landingzone2calm ${IMPORTER_VERSION} |`,
        '',
        'For the demo we built the import tools: an ArchiMate importer and a Terragrunt landing-zone importer. The native FluxNova model needs no import.',
        '',
        'The presentation and the Views lens use the CALM Hub extensions mechanism: a screen, a landing card and a diagram lens served by the calm-views extension. This demo also applies a local Hub UI patch for the lens toolbar and code viewer.',
        '',
        'The views are generated from normalized metadata. The Hub lens draws them in the Diagram tab. The export route turns a drawn view into SVG or PNG.',
        '',
        '## How to read the demo',
        '1. Open the multi-cloud architecture and stay in the Diagram tab.',
        '2. Choose **Views** in the lens selector.',
        '3. Start at **Multi-cloud overview**, then drill into a cloud, a region, an environment and a layer.',
        '4. Open the KYC model to see the same mechanism on a small, familiar system.',
        '',
        'The view selector is the only navigation control. The architecture document is never edited by a view.',
        '',
        '## Views',
        '',
        '| View | Question it answers | Reader |',
        '| --- | --- | --- |',
        '| Multi-cloud overview | What does the landing zone contain? | Architect |',
        '| AWS or GCP | What does one provider own? | Platform engineer |',
        '| Region and environment | What runs in us-prod or eu-stg? | Operations |',
        '| Network | Where are the VPCs, TGW, VPN and peerings? | Network engineer |',
        '| Security | Where are IAM, SCP, KMS, audit and guardrails? | Compliance |',
        '| Data and compute | Which databases, clusters and runtimes exist? | Application team |',
        '',
        '## Links',
        '',
        `- [Source repository (MIT)](${SOURCE_URL})`,
        `- [Open the multi-cloud architecture](${hubArchUrl(hubBase, links, links.architectureId, links.architectureVersion)})`,
        '',
    ].join('\n');
    return {
        hubApi: 0,
        title: 'CALM views: one model, three readers',
        blocks: [{ type: 'markdown', text }],
    };
}
