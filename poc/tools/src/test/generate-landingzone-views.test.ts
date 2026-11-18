import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeLandingZoneViews, type LandingZoneArchitecture } from '../generate-landingzone-views.js';

const temporary: string[] = [];
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
});
