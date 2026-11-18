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
    zetaId: string;
    zetaVersion: string;
    adrId: string;
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
const ZETA_SOURCE_URL = 'https://github.com/finos/architecture-as-code/blob/e46aeeccbb626b3260dcfc3e615096e783bb7571/calm-3.json';
const HUB_UI_SOURCE_URL = 'https://github.com/finos/architecture-as-code/tree/e46aeeccbb626b3260dcfc3e615096e783bb7571/calm-hub-ui';

function modelCounts(modelPath: string, fallbackNodes: number, fallbackRelationships: number, fallbackFlows = 0): { nodes: number; relationships: number; flows: number } {
    if (!existsSync(modelPath)) return { nodes: fallbackNodes, relationships: fallbackRelationships, flows: fallbackFlows };
    try {
        const model = JSON.parse(readFileSync(modelPath, 'utf8')) as { nodes?: unknown[]; relationships?: unknown[]; flows?: unknown[] };
        return {
            nodes: Array.isArray(model.nodes) ? model.nodes.length : fallbackNodes,
            relationships: Array.isArray(model.relationships) ? model.relationships.length : fallbackRelationships,
            flows: Array.isArray(model.flows) ? model.flows.length : fallbackFlows,
        };
    } catch {
        return { nodes: fallbackNodes, relationships: fallbackRelationships, flows: fallbackFlows };
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

function hubViewUrl(hubBase: string, links: PocLinks, id: string, version: string, view: string): string {
    return `${hubArchUrl(hubBase, links, id, version)}?lens=views&view=${encodeURIComponent(view)}`;
}

/** The home card and the screen that defend the POC inside CALM Hub. One markdown document. */
export function pocScreen(viewsDir: string, config: PocScreenConfig = {}): PocScreenReply {
    const modelPath = config.modelPath ?? join(viewsDir, '..', 'model', 'multicloud-landing-zone.architecture.json');
    const counts = modelCounts(modelPath, 295, 450);
    const kycCounts = modelCounts(join(viewsDir, '..', 'model', 'fluxnova-kyc-onboarding.architecture.json'), 20, 28);
    const echCounts = modelCounts(join(viewsDir, '..', 'model', 'ech-0122.architecture.json'), 216, 287);
    const zetaCounts = modelCounts(join(viewsDir, '..', 'model', 'fall-hackathon-zeta.architecture.json'), 15, 26, 7);
    const views = viewCount(viewsDir);
    const links: PocLinks = {
        namespace: 'finos',
        architectureId: '14',
        architectureVersion: '1.0.0',
        kycId: '12',
        kycVersion: '1.0.0',
        echId: '13',
        echVersion: '1.1.0',
        zetaId: '15',
        zetaVersion: '1.0.0',
        adrId: '1',
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
        `4 Hub models, ${views} named views, 2 import tools, 3 Hub extension points.`,
        '',
        '## Four models',
        '',
        'The demo seeds four different models. The local ZETA model describes this demo stack, its components, its Docker grouping, and its user flows.',
        '',
        '| Model | Origin | Nodes | Relationships | Flows | Model file | Source | License |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        `| [FluxNova KYC onboarding](${hubArchUrl(hubBase, links, links.kycId, links.kycVersion)}) | Native CALM | ${kycCounts.nodes} | ${kycCounts.relationships} | ${kycCounts.flows} | fluxnova-kyc-onboarding.architecture.json | CALM demo model | Apache-2.0 |`,
        `| [eCH-0122](${hubArchUrl(hubBase, links, links.echId, links.echVersion)}) | Imported from ArchiMate | ${echCounts.nodes} | ${echCounts.relationships} | ${echCounts.flows} | ech-0122.architecture.json | ArchiMate model | eCH terms |`,
        `| [Multi-cloud landing zone](${hubArchUrl(hubBase, links, links.architectureId, links.architectureVersion)}) | Imported from Terragrunt | ${counts.nodes} | ${counts.relationships} | ${counts.flows} | multicloud-landing-zone.architecture.json | [multi-cloud-runway](${SOURCE_URL}) at ${SOURCE_COMMIT} | MIT |`,
        `| [Fall Hackathon ZETA](${hubArchUrl(hubBase, links, links.zetaId, links.zetaVersion)}) | Local demo architecture | ${zetaCounts.nodes} | ${zetaCounts.relationships} | ${zetaCounts.flows} | fall-hackathon-zeta.architecture.json | [CALM tooling source](${ZETA_SOURCE_URL}) | Apache-2.0 |`,
        '',
        'The local ZETA model describes the running demo rather than the generic CALM toolchain. It records each service, its role, its endpoint or source, the Docker Compose group, the shared volumes, the seed process, and the UI-only build stage.',
        '',
        '## Local demo components',
        '',
        '| Component | Role | Link |',
        '| --- | --- | --- |',
        `| Patched UI proxy | Serves the React bundle and forwards API calls to Hub. | [Open the demo](http://localhost:8080) |`,
        '| Official Hub backend | Stores models and serves the CALM API. | [Hub documentation](https://calm.finos.org/calm-hub/) |',
        '| MongoDB | Stores Hub architecture data in a named Docker volume. | Internal endpoint: mongodb:27017 |',
        `| CALM Views | Draws named views and exports SVG or PNG. | [POC screen](${hubBase}/#/extensions/calm-views/poc), [service](http://localhost:8095) |`,
        '| C4 lens | Draws context, container, component, and deployment views. | [FINOS documentation](https://calm.finos.org/extensions/c4/) |',
        '| EA Layers lens | Draws business, application, and technology layers. | [FINOS documentation](https://calm.finos.org/extensions/ea-layers/) |',
        '| Seed script | Loads the four model versions and records their Hub IDs. | `scripts/seed-hub.mjs` |',
        `| UI build stage | Builds the patched React bundle with Node; it does not build the Hub server. | [Pinned Hub UI source](${HUB_UI_SOURCE_URL}) |`,
        `| Model files | Four versioned architecture documents, including this model. | [Open ZETA model](${hubArchUrl(hubBase, links, links.zetaId, links.zetaVersion)}) |`,
        `| View sidecars | Named selections read by CALM Views. | [List sidecars](http://localhost:8095/views) |`,
        '| Extension registry volume | Shared manifests and notations under `calm-extensions`. | Docker named volume |',
        '| Hub data volume | Persistent MongoDB data under `zeta-mongo-data`. | Docker named volume |',
        '',
        '## Views for this model',
        '',
        '| View | What it shows |',
        '| --- | --- |',
        `| [Overview](${hubViewUrl(hubBase, links, links.zetaId, links.zetaVersion, 'fall-hackathon-zeta-overview')}) | All demo components, data, and connections |`,
        `| [Docker Compose runtime](${hubViewUrl(hubBase, links, links.zetaId, links.zetaVersion, 'fall-hackathon-zeta-runtime')}) | The Hub, proxy, lenses, MongoDB, and their volumes in one group |`,
        `| [Hub lens services](${hubViewUrl(hubBase, links, links.zetaId, links.zetaVersion, 'fall-hackathon-zeta-extensions')}) | How Hub registers and calls Views, C4, and EA Layers |`,
        `| [Seed the demo](${hubViewUrl(hubBase, links, links.zetaId, links.zetaVersion, 'fall-hackathon-zeta-seeding')}) | How the seed script loads models into Hub |`,
        `| [Flow set](${hubViewUrl(hubBase, links, links.zetaId, links.zetaVersion, 'fall-hackathon-zeta-flows')}) | The seven model flows that describe the demo lifecycle |`,
        '',
        `The ADR list records why the demo keeps the official Hub backend and serves its UI through a local proxy. The seed script creates ADR ${links.adrId} in namespace ${links.namespace}.`,
        `- [Read the decision record](${hubBase}/#/namespace/${links.namespace}?type=adrs)`,
        '',
        'The presentation and the Views lens use the CALM Hub extensions mechanism: a screen, a landing card and a diagram lens served by the calm-views extension. This demo serves a locally patched Hub UI with drill-down badges, Key and Notes toolbar controls and an expanded code viewer.',
        '',
        'The views are generated from normalized metadata. The Hub lens draws them in the Diagram tab. The export route turns a drawn view into SVG or PNG.',
        '',
        '## How to read the demo',
        '1. Open the multi-cloud architecture and stay in the Diagram tab.',
        '2. Choose **Views** in the lens selector.',
        '3. Start at **Multi-cloud overview**, then drill into a cloud, a region, an environment and a layer.',
        '4. Open the KYC model to see the same mechanism on a small, familiar system.',
        '5. Open **Fall Hackathon ZETA** to inspect this demo stack, its component links, and its Hub flows.',
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
        `- [Open the Fall Hackathon ZETA architecture](${hubArchUrl(hubBase, links, links.zetaId, links.zetaVersion)})`,
        `- [Open ADRs in the finos namespace](${hubBase}/#/namespace/${links.namespace}?type=adrs)`,
        '',
    ].join('\n');
    return {
        hubApi: 0,
        title: 'Fall Hackathon ZETA: CALM views and system map',
        blocks: [{ type: 'markdown', text }],
    };
}
