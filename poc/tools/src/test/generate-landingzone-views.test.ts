import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeLandingZoneViews, type LandingZoneArchitecture } from '../generate-landingzone-views.js';

const temporary: string[] = [];
const POC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
const MODEL_PATH = join(POC_ROOT, 'model', 'multicloud-landing-zone.architecture.json');
const COMMITTED_VIEWS_DIR = join(POC_ROOT, 'views', 'multicloud-landing-zone');
const node = (id: string, name: string, metadata: Record<string, string>) => ({
    'unique-id': id,
    name,
    'node-type': metadata.kind,
    metadata,
});

const architecture: LandingZoneArchitecture = {
    nodes: [
        node('mlz', 'Landing zone', { kind: 'landing-zone', cloud: 'multicloud' }),
        node('mlz-aws', 'AWS', { kind: 'cloud', cloud: 'aws' }),
        node('mlz-aws-region-us', 'AWS us-east-2', { kind: 'region', cloud: 'aws', 'region-group': 'us' }),
        node('mlz-aws-account-us-prod', 'AWS production account', { kind: 'account', cloud: 'aws', 'region-group': 'us', env: 'prod' }),
        node('mlz-aws-service-us-prod-vpc', 'VPC', { kind: 'service', cloud: 'aws', 'region-group': 'us', env: 'prod', layer: 'network' }),
        node('mlz-gcp', 'GCP', { kind: 'cloud', cloud: 'gcp' }),
        node('mlz-gcp-region-eu', 'GCP eu', { kind: 'region', cloud: 'gcp', 'region-group': 'eu' }),
        node('mlz-gcp-project-eu-prod', 'GCP production project', { kind: 'project', cloud: 'gcp', 'region-group': 'eu', env: 'prod' }),
        node('mlz-gcp-service-eu-prod-sql', 'Cloud SQL', { kind: 'service', cloud: 'gcp', 'region-group': 'eu', env: 'prod', layer: 'data' }),
    ],
};

describe('landing-zone view generation', () => {
    afterEach(() => {
        for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
    });

    it('writes five parameterized stages in a dedicated folder', () => {
        const root = mkdtempSync(join(tmpdir(), 'calm-views-landing-zone-'));
        temporary.push(root);
        const modelDir = join(root, 'model');
        const viewsDir = join(root, 'views');
        const schemaDir = join(root, 'schema');
        mkdirSync(schemaDir, { recursive: true });
        writeFileSync(join(schemaDir, 'view.json'), '{}');
        const modelPath = join(modelDir, 'multicloud-landing-zone.architecture.json');
        const views = writeLandingZoneViews(architecture, modelPath, viewsDir);
        const byId = new Map(views.map((view) => [view['unique-id'], view]));

        assert.deepEqual([...byId.keys()].sort(), [
            'multicloud-cloud',
            'multicloud-environment',
            'multicloud-global',
            'multicloud-layer',
            'multicloud-region',
        ]);
        assert.deepEqual(byId.get('multicloud-global')?.filter.metadata.kind, ['landing-zone', 'cloud', 'ou', 'folder']);
        assert.deepEqual(byId.get('multicloud-cloud')?.filter.metadata.kind, ['cloud']);
        assert.deepEqual(byId.get('multicloud-region')?.filter.metadata.kind, ['region']);
        for (const id of ['multicloud-environment', 'multicloud-layer']) {
            assert.deepEqual(byId.get(id)?.filter.metadata, {});
        }
        assert.ok(views.every((view) => view.architecture === 'multicloud-landing-zone'));
        assert.ok(views.every((view) => view['drill-down'] === undefined));

        const multicloudViewsDir = join(viewsDir, 'multicloud-landing-zone');
        const files = readdirSync(multicloudViewsDir).filter((name) => name.endsWith('.calm-view.json'));
        assert.equal(files.length, views.length);
        const saved = JSON.parse(readFileSync(join(multicloudViewsDir, 'multicloud-global.calm-view.json'), 'utf8')) as typeof views[number];
        assert.equal(saved.for, '../../model/multicloud-landing-zone.architecture.json');
        assert.equal(saved.$schema, '../../schema/view.json');
        assert.equal(existsSync(join(multicloudViewsDir, saved.$schema)), true);
        assert.equal(readdirSync(viewsDir).some((name) => name.endsWith('.calm-view.json')), false);
    });

    it('keeps committed views in sync with the generator and resolves the schema reference', () => {
        const root = mkdtempSync(join(tmpdir(), 'calm-views-committed-'));
        temporary.push(root);
        const modelDir = join(root, 'poc', 'model');
        const viewsDir = join(root, 'poc', 'views');
        mkdirSync(modelDir, { recursive: true });
        mkdirSync(viewsDir, { recursive: true });
        const modelPath = join(modelDir, 'multicloud-landing-zone.architecture.json');
        const model = readFileSync(MODEL_PATH, 'utf8');
        writeFileSync(modelPath, model);

        const architecture = JSON.parse(model) as LandingZoneArchitecture;
        const generated = writeLandingZoneViews(architecture, modelPath, viewsDir);
        const generatedDir = join(viewsDir, 'multicloud-landing-zone');
        const expectedFiles = generated.map((view) => `${view['unique-id']}.calm-view.json`).sort();
        const committedFiles = readdirSync(COMMITTED_VIEWS_DIR)
            .filter((name) => name.endsWith('.calm-view.json'))
            .sort();

        assert.deepEqual(committedFiles, expectedFiles);
        for (const name of expectedFiles) {
            const committedPath = join(COMMITTED_VIEWS_DIR, name);
            const contents = readFileSync(committedPath, 'utf8');
            const view = JSON.parse(contents) as { '$schema': string };
            assert.equal(contents, readFileSync(join(generatedDir, name), 'utf8'), `${name} differs from generator output`);
            assert.equal(existsSync(resolve(dirname(committedPath), view.$schema)), true, `${name} schema reference does not exist`);
        }
    });
});
