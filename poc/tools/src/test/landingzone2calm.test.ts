import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    AWS_VARS,
    GCP_VARS,
    Importer,
    SOURCE_URL,
    loadYaml,
    validate,
} from '../landingzone2calm.js';

const POC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE = process.env.CALM_LANDINGZONE_SOURCE ?? join(POC, '..', '.local', 'multi-cloud-runway');
const IMPORTER_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'landingzone2calm.js');
const available = existsSync(join(SOURCE, AWS_VARS));

describe('landing zone import arguments', () => {
    it('rejects the removed check-only flag instead of writing a model', () => {
        const result = spawnSync(process.execPath, [IMPORTER_CLI, '--check-only'], { encoding: 'utf8' });
        assert.equal(result.status, 2);
        assert.match(result.stderr, /unknown argument: --check-only/);
    });
});

describe('landing zone import', { skip: !available }, () => {
    let out: string;
    let result: Record<string, any>;
    let document: Record<string, any>;
    let nodes: Map<string, Record<string, any>>;

    before(() => {
        out = mkdtempSync(join(tmpdir(), 'calm-import-'));
        const previousEpoch = process.env.SOURCE_DATE_EPOCH;
        process.env.SOURCE_DATE_EPOCH = '1794957778';
        try {
            result = new Importer(SOURCE, out).write();
        } finally {
            if (previousEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
            else process.env.SOURCE_DATE_EPOCH = previousEpoch;
        }
        const modelFile = 'multicloud-landing-zone.architecture.json';
        document = JSON.parse(readFileSync(join(out, modelFile), 'utf8'));
        nodes = new Map(document.nodes.map((node: Record<string, any>) => [node['unique-id'], node]));
        assert.deepEqual(readdirSync(out), [modelFile], 'import writes only the CALM model');
    });

    after(() => {
        rmSync(out, { recursive: true, force: true });
    });

    const meta = (id: string): Record<string, any> => nodes.get(id)?.metadata ?? {};

    it('is structurally valid', () => {
        assert.deepEqual(validate(join(out, 'multicloud-landing-zone.architecture.json')), []);
    });

    it('has the expected counts and roots', () => {
        assert.equal(result.nodes, 295);
        assert.equal(result.relationships, 450);
        assert.equal(nodes.get('mlz')?.['node-type'], 'ecosystem');
        assert.equal(nodes.get('mlz-aws')?.['node-type'], 'cloud');
        assert.equal(nodes.get('mlz-gcp')?.['node-type'], 'cloud');
    });

    it('keeps the AWS environment axes', () => {
        assert.equal(meta('mlz-aws-env-eu-prod').env, 'prod');
        assert.equal(meta('mlz-aws-env-eu-prod')['region-group'], 'eu');
        assert.equal(meta('mlz-aws-eu-prod-ec2').env, 'prod');
        assert.equal(meta('mlz-aws-eu-prod-ec2')['region-group'], 'eu');
    });

    it('keeps the GCP environment axes', () => {
        const prodEu = meta('mlz-gcp-env-prod-eu');
        assert.equal(prodEu.env, 'prod');
        assert.equal(prodEu['region-group'], 'eu');
        assert.equal(prodEu.folder, 'prod/eu');
        const shrdDev = meta('mlz-gcp-env-shrd-dev');
        assert.equal(shrdDev.env, 'dev');
        assert.equal(shrdDev['region-group'], 'eu');
        assert.equal(shrdDev.folder, 'shrd/dev');
        const prodUs = meta('mlz-gcp-env-prod-us');
        assert.equal(prodUs.env, 'prod');
        assert.equal(prodUs['region-group'], 'us');
    });

    it('uses cloud service types and icons', () => {
        const cases: Array<[string, string, string]> = [
            ['mlz-aws-eu-prod-ec2', 'virtual-machine', 'amazon-ec2'],
            ['mlz-aws-eu-prod-s3', 'object-storage', 'amazon-s3'],
            ['mlz-aws-eu-prod-eks', 'kubernetes-cluster', 'amazon-eks'],
            ['mlz-aws-network-tgw', 'transit-gateway', 'aws-transit-gateway'],
            ['mlz-gcp-prod-eu-svc-gke', 'kubernetes-cluster', 'google-kubernetes-engine'],
            ['mlz-gcp-prod-eu-svc-sql', 'database', 'google-cloud-sql'],
            ['mlz-gcp-prod-eu-svc-redis', 'cache', 'google-cloud-memorystore'],
        ];
        for (const [id, type, icon] of cases) {
            assert.equal(nodes.get(id)?.['node-type'], type, id);
            assert.equal(meta(id).icon, icon, id);
        }
    });

    it('gives every node a type and icon metadata', () => {
        for (const node of document.nodes) {
            assert.ok(node['node-type'], node['unique-id']);
            for (const key of ['icon', 'icon-set', 'icon-label', 'resource-type']) {
                assert.ok(node.metadata[key], `${node['unique-id']} ${key}`);
            }
        }
    });

    it('does not duplicate the AWS transit gateway', () => {
        const tgws = document.nodes
            .filter((node: Record<string, any>) => node['node-type'] === 'transit-gateway')
            .map((node: Record<string, any>) => node['unique-id'])
            .sort();
        assert.deepEqual(tgws, ['mlz-aws-network-tgw', 'mlz-aws-us-dev-tgw']);
        assert.equal(nodes.has('mlz-aws-tgw-network'), false);
        assert.equal(nodes.has('mlz-aws-tgw-us-dev'), false);
        assert.equal(nodes.has('mlz-aws-tgw-mmd'), false);
    });

    it('has no dangling relationship endpoints', () => {
        const ids = new Set(nodes.keys());
        for (const rel of document.relationships) {
            const relType = rel['relationship-type'] ?? {};
            assert.equal(Object.keys(relType).length, 1, rel['unique-id']);
            const [name, body] = Object.entries(relType)[0] as [string, Record<string, any>];
            if (name === 'composed-of' || name === 'deployed-in') {
                assert.ok(ids.has(body.container), rel['unique-id']);
                for (const child of body.nodes) assert.ok(ids.has(child), rel['unique-id']);
            } else if (name === 'connects') {
                assert.ok(ids.has(body.source.node), rel['unique-id']);
                assert.ok(ids.has(body.destination.node), rel['unique-id']);
            } else {
                assert.fail(`unsupported relationship type ${name}`);
            }
        }
    });

    it('writes only the model and keeps source provenance inline', () => {
        const modelJson = JSON.stringify(document);
        assert.equal(modelJson.includes('multicloud-landing-zone.sources.json'), false);
        assert.equal(modelJson.includes('multicloud-landing-zone.views-summary.json'), false);
        assert.equal(modelJson.includes('"sidecar"'), false);
        assert.equal(Object.hasOwn(document.metadata, 'sources'), false);
        assert.equal(Object.hasOwn(document.metadata, 'views-summary'), false);
        assert.equal(document.metadata.provenance['source-repo'], SOURCE_URL);
        assert.equal(document.metadata.provenance['source-license'], 'MIT');
        assert.equal(document.metadata.provenance['source-commit'], new Importer(SOURCE, out).commit);
        assert.equal(nodes.get('mlz')?.metadata.source.vars.path, AWS_VARS);
        assert.match(nodes.get('mlz')?.metadata.source.vars.sha256 ?? '', /^[0-9a-f]{64}$/);
        assert.equal(result.sidecar, undefined);
        assert.equal(result.summary, undefined);
        assert.equal(result.provenance, undefined);
        const modelBytes = readFileSync(join(out, 'multicloud-landing-zone.architecture.json'));
        assert.equal(result.model_bytes, modelBytes.length);
        assert.equal(createHash('sha256').update(modelBytes).digest('hex'), '3e6a513fb9331c2319062cf715bb8acbafb238951ac7fb4f658c926c1b1a62a2');
        assert.deepEqual(modelBytes, readFileSync(join(POC, 'model', 'multicloud-landing-zone.architecture.json')));
    });

    it('repeats the same model bytes for the same source and import date', () => {
        const secondOut = mkdtempSync(join(tmpdir(), 'calm-import-repeat-'));
        const previousEpoch = process.env.SOURCE_DATE_EPOCH;
        process.env.SOURCE_DATE_EPOCH = '1794957778';
        try {
            new Importer(SOURCE, secondOut).write();
            assert.deepEqual(readdirSync(secondOut), ['multicloud-landing-zone.architecture.json']);
            assert.deepEqual(
                readFileSync(join(secondOut, 'multicloud-landing-zone.architecture.json')),
                readFileSync(join(out, 'multicloud-landing-zone.architecture.json')),
            );
        } finally {
            if (previousEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
            else process.env.SOURCE_DATE_EPOCH = previousEpoch;
            rmSync(secondOut, { recursive: true, force: true });
        }
    });

    it('tolerates duplicate anchors in the source vars', () => {
        const aws = loadYaml(join(SOURCE, AWS_VARS));
        assert.ok(aws.Environments['us-dev']);
        const gcp = loadYaml(join(SOURCE, GCP_VARS));
        assert.ok(gcp.envs);
    });
});
