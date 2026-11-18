import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JsonRecord } from './calm.js';

export interface LandingZoneView {
    '$schema': string;
    'unique-id': string;
    name: string;
    description: string;
    audience: string[];
    'suggested-formats': string[];
    group: string;
    for: string;
    architecture: string;
    filter: { metadata: Record<string, string[]> };
    'drill-down'?: Record<string, string>;
}

export type LandingZoneArchitecture = { nodes: JsonRecord[] };

const LANDING_ZONE_ID = 'multicloud-global';
const VIEW_IDS = ['multicloud-global', 'multicloud-cloud', 'multicloud-region', 'multicloud-environment', 'multicloud-layer'];

function view(
    id: string,
    name: string,
    description: string,
    schemaReference: string,
    modelReference: string,
    filter: Record<string, string | string[]>,
    drillDown?: Record<string, string>
): LandingZoneView {
    return {
        '$schema': schemaReference,
        'unique-id': id,
        name,
        description,
        audience: ['cloud-architects', 'platform-engineers'],
        'suggested-formats': ['svg', 'json'],
        group: 'Multi-cloud landing zone',
        for: modelReference,
        architecture: 'multicloud-landing-zone',
        filter: { metadata: Object.fromEntries(Object.entries(filter).map(([key, value]) => [key, Array.isArray(value) ? value : [value]])) },
        ...(drillDown && Object.keys(drillDown).length > 0 ? { 'drill-down': drillDown } : {}),
    };
}

export function generateLandingZoneViews(architecture: LandingZoneArchitecture, modelPath: string, viewsDir: string): LandingZoneView[] {
    const modelReference = relative(viewsDir, modelPath).replaceAll('\\', '/');
    const schemaReference = relative(viewsDir, join(dirname(dirname(modelPath)), 'schema', 'view.json')).replaceAll('\\', '/');
    const views = [
        view(LANDING_ZONE_ID, 'Multi-cloud overview', 'The landing zone root, cloud providers, organizations and folders.', schemaReference, modelReference,
            { kind: ['landing-zone', 'cloud', 'ou', 'folder'] }),
        view('multicloud-cloud', 'Cloud', 'A cloud provider and its regions, environments and services.', schemaReference, modelReference, { kind: ['cloud'] }),
        view('multicloud-region', 'Region group', 'A US, EU or global slice of the selected cloud.', schemaReference, modelReference, { kind: ['region'] }),
        view('multicloud-environment', 'Environment', 'A production, staging or development slice within the selected cloud and region.', schemaReference, modelReference, {}),
        view('multicloud-layer', 'Layer', 'A governance, platform, security, network, data or compute slice within the selected environment.', schemaReference, modelReference, {}),
    ];
    if (new Set(views.map((item) => item['unique-id'])).size !== VIEW_IDS.length) throw new Error('The multicloud view set must contain five unique ids.');
    return views;
}

export function writeLandingZoneViews(architecture: LandingZoneArchitecture, modelPath: string, viewsDir: string): LandingZoneView[] {
    const outputDir = resolve(viewsDir, 'multicloud-landing-zone');
    const generated = generateLandingZoneViews(architecture, modelPath, outputDir);
    mkdirSync(outputDir, { recursive: true });
    const generatedIds = new Set(generated.map((item) => item['unique-id']));
    for (const dir of [viewsDir, outputDir]) {
        for (const name of readdirSync(dir).filter((file) => file.endsWith('.calm-view.json'))) {
            const path = resolve(dir, name);
            const previous = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
            if (previous.architecture === 'multicloud-landing-zone'
                && previous.group === 'Multi-cloud landing zone'
                && (dir === viewsDir || !generatedIds.has(String(previous['unique-id'])))) {
                unlinkSync(path);
            }
        }
    }
    for (const item of generated) {
        const name = `${item['unique-id']}.calm-view.json`;
        writeFileSync(resolve(outputDir, name), `${JSON.stringify(item, null, 2)}\n`, 'utf8');
    }
    return generated;
}

function run(): void {
    const toolsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const defaultModel = resolve(toolsDir, '../model/multicloud-landing-zone.architecture.json');
    const defaultViews = resolve(toolsDir, '../views');
    const modelPath = resolve(process.argv[2] ?? defaultModel);
    const viewsDir = resolve(process.argv[3] ?? defaultViews);
    const architecture = JSON.parse(readFileSync(modelPath, 'utf8')) as LandingZoneArchitecture;
    const generated = writeLandingZoneViews(architecture, modelPath, viewsDir);
    console.log(`Generated ${generated.length} multicloud views for ${basename(modelPath)}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
