#!/usr/bin/env node
/** Import a multi-cloud landing zone into a CALM 1.2 model.
 *
 * Source: cloudon-one/multi-cloud-runway (MIT). This is the TypeScript port of
 * the original Python importer; it reads the AWS and GCP Terragrunt layout,
 * the vars.yaml files, architecture.mmd and the architecture report.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

type Dict = Record<string, any>;

export const CALM_SCHEMA = 'https://calm.finos.org/release/1.2/meta/calm.json';
export const SOURCE_URL = 'https://github.com/cloudon-one/multi-cloud-runway';
export const SOURCE_LICENSE = 'MIT';
export const IMPORTER_VERSION = '0.3.0';
export const AWS_VARS = 'aws-terragrunt-configuration/aws/vars.yaml';
export const GCP_VARS = 'gcp-terragrunt-configuration/terragrunt/vars.yaml';
export const MMD = 'architecture.mmd';
export const REPORT = 'ARCHITECTURE_REPORT.json';
export const DEFAULT_SOURCE = '/tmp/cloudon-runway';

const TOOLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT = resolve(TOOLS_DIR, '..', 'model');

export function loadYaml(path: string): any {
    return parseYaml(readFileSync(path, 'utf8'));
}

export function sha256Text(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function slug(...parts: any[]): string {
    const raw = parts
        .filter((part) => part !== null && part !== undefined && part !== '')
        .map((part) => String(part))
        .join('-')
        .toLowerCase();
    return raw.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'node';
}

export function deepcopy<T>(value: T): T {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}

export function isDict(value: any): value is Dict {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function firstDict(...values: any[]): Dict {
    for (const value of values) {
        if (isDict(value)) return value;
    }
    return {};
}

export function asInputs(spec: any): any {
    if (isDict(spec)) {
        if ('inputs' in spec) return spec.inputs;
        return spec;
    }
    return spec;
}

export function tagValue(tags: any, ...names: string[]): string | null {
    if (!isDict(tags)) return null;
    const lower = Object.fromEntries(Object.entries(tags).map(([key, value]) => [String(key).toLowerCase(), value]));
    for (const name of names) {
        const value = lower[name.toLowerCase()];
        if (value !== null && value !== undefined && value !== '') return String(value);
    }
    return null;
}

export function liftTags(tags: any): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of ['owner', 'environment', 'data-classification', 'compliance-scope']) {
        const value = tagValue(tags, key, key.replaceAll('-', '_'), key.replaceAll('-', ''));
        if (value) out[key] = value;
    }
    return out;
}

const LAYER_MAP: Record<string, string> = {
    vpc: 'network',
    vpn: 'network',
    tgw: 'network',
    network: 'network',
    inspection: 'security',
    'net-vpc': 'network',
    'net-vpn': 'network',
    'net-dns': 'network',
    'net-firewalls': 'security',
    'net-vpc-attachments': 'network',
    'net-glb': 'network',
    'net-peering': 'network',
    'net-iam-permissions': 'security',
    'svc-iam-permissions': 'security',
    iam: 'security',
    kms: 'security',
    scp: 'security',
    security: 'security',
    eventbridge: 'platform',
    sns: 'platform',
    cloudtrail: 'security',
    audit: 'security',
    vpcsc: 'security',
    'org-policies': 'governance',
    tags: 'governance',
    admin: 'governance',
    rds: 'data',
    aurora: 'data',
    dynamodb: 'data',
    redis: 'data',
    s3: 'data',
    'svc-sql': 'data',
    'svc-redis': 'data',
    'svc-projects': 'platform',
    'svc-gke': 'compute',
    'svc-datadog': 'platform',
    eks: 'compute',
    ec2: 'compute',
    acm: 'security',
    'api-gw': 'network',
    'github-actions': 'ci',
};

const DATA_SERVICES = new Set(['rds', 'aurora', 'dynamodb', 'redis', 'svc-sql', 'svc-redis']);
const STORAGE_SERVICES = new Set(['s3', 'gcs', 'storage', 'bucket']);

export function layerOf(service: string): string {
    const key = service.toLowerCase();
    for (const prefix of ['svc-', 'net-']) {
        if (key.startsWith(prefix)) {
            const base = key.slice(prefix.length);
            if (key in LAYER_MAP) return LAYER_MAP[key];
            if (base in LAYER_MAP) return LAYER_MAP[base];
        }
    }
    if (key in LAYER_MAP) return LAYER_MAP[key];
    if (key.includes('sql') || key.includes('redis') || key.includes('database')) return 'data';
    if (key.includes('gke') || key.includes('eks') || key.includes('vm')) return 'compute';
    if (key.includes('iam') || key.includes('kms') || key.includes('policy') || key.includes('secret')) return 'security';
    if (key.includes('vpc') || key.includes('vpn') || key.includes('network') || key.includes('dns') || key.includes('lb')) return 'network';
    return 'platform';
}

const STRUCTURAL_NODE_TYPES: Record<string, string> = {
    'landing-zone': 'ecosystem',
    cloud: 'cloud',
    config: 'configuration',
    ou: 'organizational-unit',
    folder: 'folder',
    account: 'account',
    project: 'project',
    region: 'region',
    env: 'environment',
    vpc: 'virtual-network',
    subnet: 'subnet',
    tgw: 'transit-gateway',
    nat: 'nat-gateway',
};

const SERVICE_NODE_TYPES: Record<string, Record<string, string>> = {
    aws: {
        vpc: 'virtual-network',
        tgw: 'transit-gateway',
        vpn: 'vpn-gateway',
        inspection: 'inspection-vpc',
        ec2: 'virtual-machine',
        eks: 'kubernetes-cluster',
        rds: 'database',
        aurora: 'database-cluster',
        dynamodb: 'nosql-database',
        redis: 'cache',
        s3: 'object-storage',
        sns: 'notification-topic',
        eventbridge: 'event-bus',
        acm: 'certificate',
        'api-gw': 'api-gateway',
        iam: 'identity-provider',
        'iam-groups': 'identity-group',
        'iam-policies': 'policy',
        'iam-roles': 'identity-role',
        'iam-users': 'identity-user',
        scp: 'policy',
        cloudtrail: 'audit-log',
        org_units: 'organizational-unit',
        accounts: 'account-factory',
        subnet: 'subnet',
    },
    gcp: {
        'net-vpc': 'virtual-network',
        'net-dns': 'dns-zone',
        'net-firewalls': 'firewall',
        'net-glb': 'load-balancer',
        'net-vpn': 'vpn-gateway',
        'net-peering': 'network-peering',
        'net-vpc-attachments': 'network-attachment',
        'net-iam-permissions': 'iam-binding',
        'svc-iam-permissions': 'iam-binding',
        'svc-projects': 'project-factory',
        'svc-gke': 'kubernetes-cluster',
        'svc-sql': 'database',
        'svc-redis': 'cache',
        'svc-datadog': 'monitoring',
        kms: 'key-management',
        audit: 'audit-log',
        vpcsc: 'service-control',
        'org-policies': 'policy',
        tags: 'tag-policy',
        admin: 'admin-project',
        iam: 'identity-provider',
        subnet: 'subnet',
        nat: 'nat-gateway',
    },
};

// The icon key is a vendor-neutral handle for the view renderer. It is not an
// asset path: the official AWS/Google icon sets stay external and licensed.
const ICON_BY_SERVICE: Record<string, Record<string, [string, string]>> = {
    aws: {
        vpc: ['amazon-vpc', 'Amazon VPC'],
        tgw: ['aws-transit-gateway', 'AWS Transit Gateway'],
        vpn: ['aws-site-to-site-vpn', 'AWS Site-to-Site VPN'],
        inspection: ['aws-network-firewall', 'AWS Network Firewall inspection VPC'],
        ec2: ['amazon-ec2', 'Amazon EC2'],
        eks: ['amazon-eks', 'Amazon EKS'],
        rds: ['amazon-rds', 'Amazon RDS'],
        aurora: ['amazon-aurora', 'Amazon Aurora'],
        dynamodb: ['amazon-dynamodb', 'Amazon DynamoDB'],
        redis: ['amazon-elasticache', 'Amazon ElastiCache'],
        s3: ['amazon-s3', 'Amazon S3'],
        sns: ['amazon-sns', 'Amazon SNS'],
        eventbridge: ['amazon-eventbridge', 'Amazon EventBridge'],
        acm: ['aws-certificate-manager', 'AWS Certificate Manager'],
        'api-gw': ['amazon-api-gateway', 'Amazon API Gateway'],
        iam: ['aws-iam', 'AWS IAM'],
        'iam-groups': ['aws-iam', 'AWS IAM groups'],
        'iam-policies': ['aws-iam', 'AWS IAM policies'],
        'iam-roles': ['aws-iam', 'AWS IAM roles'],
        'iam-users': ['aws-iam', 'AWS IAM users'],
        scp: ['aws-organizations', 'AWS Organizations SCP'],
        cloudtrail: ['aws-cloudtrail', 'AWS CloudTrail'],
        org_units: ['aws-organizations', 'AWS Organizations'],
        accounts: ['aws-organizations', 'AWS account factory'],
        subnet: ['aws-subnet', 'AWS Subnet'],
    },
    gcp: {
        'net-vpc': ['google-cloud-vpc', 'Virtual Private Cloud'],
        'net-dns': ['google-cloud-dns', 'Cloud DNS'],
        'net-firewalls': ['google-cloud-firewall', 'Cloud Firewall'],
        'net-glb': ['google-cloud-load-balancing', 'Cloud Load Balancing'],
        'net-vpn': ['google-cloud-vpn', 'Cloud VPN'],
        'net-peering': ['google-cloud-vpc-peering', 'VPC Network Peering'],
        'net-vpc-attachments': ['google-cloud-shared-vpc', 'Shared VPC'],
        'net-iam-permissions': ['google-cloud-iam', 'Cloud IAM'],
        'svc-iam-permissions': ['google-cloud-iam', 'Cloud IAM'],
        'svc-projects': ['google-cloud-project', 'Resource Manager project'],
        'svc-gke': ['google-kubernetes-engine', 'Google Kubernetes Engine'],
        'svc-sql': ['google-cloud-sql', 'Cloud SQL'],
        'svc-redis': ['google-cloud-memorystore', 'Memorystore'],
        'svc-datadog': ['datadog', 'Datadog integration'],
        kms: ['google-cloud-kms', 'Cloud KMS'],
        audit: ['google-cloud-audit-logs', 'Cloud Audit Logs'],
        vpcsc: ['google-cloud-vpc-service-controls', 'VPC Service Controls'],
        'org-policies': ['google-cloud-org-policy', 'Organization Policy'],
        tags: ['google-cloud-resource-tags', 'Resource Tags'],
        admin: ['google-cloud-admin', 'Admin project'],
        iam: ['google-cloud-iam', 'Cloud IAM'],
        subnet: ['google-cloud-subnet', 'Subnet'],
        nat: ['google-cloud-nat', 'Cloud NAT'],
    },
};

const ICON_BY_STRUCTURE: Record<string, [string, string]> = {
    'aws|cloud': ['aws-cloud', 'AWS Cloud'],
    'aws|region': ['aws-region', 'AWS Region'],
    'aws|ou': ['aws-organizations', 'AWS Organizational Unit'],
    'aws|account': ['aws-account', 'AWS Account'],
    'aws|env': ['aws-environment', 'AWS Environment'],
    'aws|config': ['aws-configuration', 'AWS Configuration'],
    'gcp|cloud': ['google-cloud', 'Google Cloud'],
    'gcp|region': ['google-cloud-region', 'Google Cloud Region'],
    'gcp|folder': ['google-cloud-folder', 'Folder'],
    'gcp|project': ['google-cloud-project', 'Project'],
    'gcp|env': ['google-cloud-environment', 'Environment'],
    'gcp|config': ['google-cloud-configuration', 'Configuration'],
    'multicloud|landing-zone': ['multi-cloud', 'Multi-cloud landing zone'],
    'multicloud|cloud': ['multi-cloud', 'Multi-cloud'],
};

const ICON_SETS: Record<string, string> = {
    aws: 'aws-architecture-icons',
    gcp: 'google-cloud-icons',
    multicloud: 'calm',
};

export function nodeTypeFor(cloud: string | null | undefined, kind: string | null | undefined, service: string | null | undefined, fallback: string): string {
    if (service) {
        const mapped = SERVICE_NODE_TYPES[cloud ?? '']?.[service];
        if (mapped) return mapped;
    }
    if (kind && kind in STRUCTURAL_NODE_TYPES) return STRUCTURAL_NODE_TYPES[kind];
    return fallback;
}

export function iconFor(cloud: string | null | undefined, kind: string | null | undefined, service: string | null | undefined): [string, string, string] {
    const provider = cloud || 'multicloud';
    let icon: string;
    let label: string;
    if (service && ICON_BY_SERVICE[provider]?.[service]) {
        [icon, label] = ICON_BY_SERVICE[provider][service];
    } else if (ICON_BY_STRUCTURE[`${provider}|${kind ?? ''}`]) {
        [icon, label] = ICON_BY_STRUCTURE[`${provider}|${kind ?? ''}`];
    } else if (service) {
        icon = `${provider}-${slug(service)}`;
        label = service;
    } else {
        icon = `${provider}-${slug(kind || 'node')}`;
        label = kind || 'node';
    }
    const iconSet = icon === 'datadog' ? 'datadog-icons' : (ICON_SETS[provider] ?? 'calm');
    return [icon, iconSet, label];
}

export function enrichMetadata(metadata: Dict, cloudHint?: string | null): Dict {
    const meta = deepcopy(metadata);
    const cloud = String(meta.cloud ?? cloudHint ?? 'multicloud');
    if ((cloud === 'aws' || cloud === 'gcp') && !meta.provider) meta.provider = cloud;
    if (!('resource-type' in meta)) meta['resource-type'] = meta.service ?? meta.kind;
    const [icon, iconSet, label] = iconFor(cloud, meta.kind, meta.service);
    if (!('icon' in meta)) meta.icon = icon;
    if (!('icon-set' in meta)) meta['icon-set'] = iconSet;
    if (!('icon-label' in meta)) meta['icon-label'] = label;
    return meta;
}

export function nodeTypeOf(layer: string, kind: string, service = '', cloud: string | null = null): string {
    const mapped = nodeTypeFor(cloud, kind, service, '');
    if (mapped) return mapped;
    if (DATA_SERVICES.has(service)) return 'database';
    if (STORAGE_SERVICES.has(service)) return 'object-storage';
    if (layer === 'network') return 'network';
    if (layer === 'data') return 'database';
    return 'service';
}

function isEmptyValue(value: any): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (isDict(value)) return Object.keys(value).length === 0;
    return false;
}

const NORMALIZED_KEYS: Record<string, string> = {
    region_group: 'region-group',
    data_classification: 'data-classification',
    compliance_scope: 'compliance-scope',
    resource_type: 'resource-type',
    icon_set: 'icon-set',
    icon_label: 'icon-label',
};

export function kindMeta(kind: string, level: number, values: Dict): Dict {
    const meta: Dict = { kind, level };
    for (const [key, value] of Object.entries(values)) {
        if (isEmptyValue(value)) continue;
        meta[NORMALIZED_KEYS[key] ?? key] = value;
    }
    return meta;
}

export function inferAwsOu(accountKey: string): string {
    if (accountKey.endsWith('-dev')) return 'development';
    if (accountKey.endsWith('-stg') || accountKey.endsWith('-prod')) return 'production';
    if (accountKey === 'management') return 'management';
    if (accountKey === 'security' || accountKey === 'log-archive') return 'security';
    if (accountKey === 'shared-services' || accountKey === 'network') return 'management';
    return 'production';
}

export function awsEnvParts(accountKey: string): [string | null, string | null] {
    const match = /^(us|eu)-(dev|stg|prod)$/.exec(accountKey);
    if (match) return [match[1], match[2]];
    return [null, null];
}

export function gcpRegionGroup(region: any): string | null {
    const value = String(region ?? '').toLowerCase();
    if (value.startsWith('europe')) return 'eu';
    if (value.startsWith('us')) return 'us';
    if (value.startsWith('asia')) return 'asia';
    return null;
}

export function hclModule(text: string): string | null {
    const match = /source\s*=\s*"([^"]+)"/.exec(text);
    return match ? match[1] : null;
}

export interface MermaidNode {
    id: string;
    label: string;
    cloud: string | null;
}

export interface MermaidEdge {
    source: string;
    target: string;
    kind: string;
}

export function parseMermaid(text: string): [MermaidNode[], MermaidEdge[]] {
    const nodes: MermaidNode[] = [];
    const edges: MermaidEdge[] = [];
    let currentCloud: string | null = null;
    for (const line of text.split(/\r?\n/)) {
        const stripped = line.trim();
        const sub = /^subgraph\s+([A-Za-z0-9_]+)/.exec(stripped);
        if (sub) {
            const name = sub[1].toUpperCase();
            currentCloud = name.startsWith('AWS') ? 'aws' : name.startsWith('GCP') ? 'gcp' : null;
            continue;
        }
        if (stripped === 'end') {
            currentCloud = null;
            continue;
        }
        if (stripped.startsWith('%%') || !stripped) continue;
        const edge = /^\s*([A-Za-z0-9_]+)\s*(---|-\.peering\.-|-->)\s*([A-Za-z0-9_]+)\s*$/.exec(stripped);
        if (edge) {
            edges.push({
                source: edge[1],
                target: edge[3],
                kind: edge[2].includes('peering') ? 'peering' : 'connects',
            });
            continue;
        }
        const match = /^\s*([A-Za-z0-9_]+)\s*\["?(.+?)"?\]\s*$/.exec(stripped) ?? /^\s*([A-Za-z0-9_]+)\s*\[([^\]]+)\]\s*$/.exec(stripped);
        if (match) {
            nodes.push({ id: match[1], label: match[2].trim().replace(/^"|"$/g, ''), cloud: currentCloud });
        }
    }
    return [nodes, edges];
}

export function labelParts(label: string): [string | null, string | null] {
    const cidrMatch = /(\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2})/.exec(label);
    const cidr = cidrMatch ? cidrMatch[1] : null;
    let clean = label.replace(/<br\s*\/?>/g, ' ');
    clean = clean.replace('<br>', ' ');
    if (clean.includes(':')) {
        const index = clean.indexOf(':');
        return [clean.slice(index + 1).trim(), cidr ?? clean.slice(0, index).trim()];
    }
    const parts = clean.trim().split(/\s+/).filter(Boolean);
    return [(parts[0] ?? clean).trim(), cidr];
}

function isoSeconds(): string {
    const epoch = Number(process.env.SOURCE_DATE_EPOCH ?? NaN);
    const now = Number.isFinite(epoch) ? new Date(epoch * 1000) : new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}+00:00`;
}

export class Model {
    readonly sourceDir: string;
    readonly commit: string;
    readonly nodes: Record<string, Dict> = {};
    readonly rels: Record<string, Dict> = {};
    readonly fileHashes = new Map<string, string>();
    rootMeta: Dict = {};
    readonly generatedAt: string;

    constructor(sourceDir: string, commit: string) {
        this.sourceDir = sourceDir;
        this.commit = commit;
        this.generatedAt = isoSeconds();
    }

    addFile(relativePath: string | null | undefined): Dict | null {
        if (!relativePath) return null;
        const path = join(this.sourceDir, relativePath);
        if (!existsSync(path) || !statSync(path).isFile()) return null;
        if (!this.fileHashes.has(relativePath)) {
            const text = readFileSync(path, 'utf8');
            this.fileHashes.set(relativePath, sha256Text(text));
        }
        return {
            repo: SOURCE_URL,
            commit: this.commit,
            license: SOURCE_LICENSE,
            path: relativePath,
            sha256: this.fileHashes.get(relativePath),
        };
    }

    sourceRef(options: {
        hcl?: string | null;
        varsPath?: string | null;
        mmd?: string | null;
        module?: string | null;
        resource?: string | null;
        extra?: Dict | null;
    } = {}): Dict {
        const out: Dict = { repo: SOURCE_URL, commit: this.commit, license: SOURCE_LICENSE };
        for (const [key, value] of [['file', options.hcl], ['vars', options.varsPath], ['mmd', options.mmd]] as const) {
            const ref = this.addFile(value);
            if (ref) out[key] = ref;
        }
        if (options.module) out.module = options.module;
        if (options.resource) out.resource = options.resource;
        if (options.extra) Object.assign(out, options.extra);
        return out;
    }

    private static mergeMetadata(target: Dict, incoming: Dict): void {
        for (const [key, value] of Object.entries(incoming)) {
            if (['source', 'attributes', 'compliance', 'mmd'].includes(key) && isDict(value)) {
                const existing = target[key];
                if (isDict(existing)) Object.assign(existing, deepcopy(value));
                else target[key] = deepcopy(value);
            } else if (!(key in target) || isEmptyValue(target[key])) {
                target[key] = deepcopy(value);
            }
        }
    }

    addNode(
        nodeId: string,
        name: string,
        nodeType: string,
        parent: string | null,
        metadata: Dict,
        description?: string | null,
        relation = 'composed-of',
    ): string {
        const meta = enrichMetadata(metadata);
        nodeType = nodeTypeFor(meta.cloud, meta.kind, meta.service, nodeType);
        const node = this.nodes[nodeId];
        if (!node) {
            this.nodes[nodeId] = {
                'unique-id': nodeId,
                'node-type': nodeType,
                name,
                description: description || `${name} in the multi-cloud landing zone.`,
                metadata: meta,
            };
        } else {
            Model.mergeMetadata(node.metadata, meta);
            node['node-type'] = nodeTypeFor(node.metadata.cloud, node.metadata.kind, node.metadata.service, nodeType);
            if (!node.description && description) node.description = description;
        }
        if (parent) this.addContainerRel(parent, nodeId, relation, meta.source);
        return nodeId;
    }

    addContainerRel(parent: string, child: string, relation: string, source?: any): void {
        if (parent === child) return;
        let key: string;
        if (relation === 'deployed-in') {
            key = `deployed-in::${parent}::${child}`;
            if (key in this.rels) return;
            this.rels[key] = {
                'unique-id': slug('rel', 'deployed-in', parent, child),
                description: `${child} is deployed in ${parent}.`,
                'relationship-type': { 'deployed-in': { container: parent, nodes: [child] } },
                metadata: { kind: 'deployed-in', container: parent, child },
            };
        } else {
            key = `composed-of::${parent}::${child}`;
            if (key in this.rels) return;
            this.rels[key] = {
                'unique-id': slug('rel', 'composed-of', parent, child),
                description: `${parent} contains ${child}.`,
                'relationship-type': { 'composed-of': { container: parent, nodes: [child] } },
                metadata: { kind: 'composed-of', container: parent, child },
            };
        }
        if (source) this.rels[key].metadata.source = source;
    }

    addConnects(source: string, destination: string, label?: string | null, metadata?: Dict | null): void {
        if (source === destination) return;
        const key = `connects::${source}::${destination}`;
        if (key in this.rels) {
            const existing = this.rels[key];
            if (label && !String(existing.description ?? '').includes(label)) {
                existing.description = `${existing.description ?? ''} ${label}`.trim();
            }
            if (metadata) Object.assign(existing.metadata, deepcopy(metadata));
            return;
        }
        this.rels[key] = {
            'unique-id': slug('rel', 'connects', source, destination),
            description: label || `${source} connects to ${destination}.`,
            'relationship-type': { connects: { source: { node: source }, destination: { node: destination } } },
            metadata: { kind: 'connects', ...(metadata ?? {}) },
        };
    }

    document(): Dict {
        return {
            '$schema': CALM_SCHEMA,
            'unique-id': 'multicloud-landing-zone',
            nodes: Object.keys(this.nodes).sort().map((key) => this.nodes[key]),
            relationships: Object.keys(this.rels).sort().map((key) => this.rels[key]),
            metadata: this.rootMeta,
        };
    }
}

function walkFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(path));
        else out.push(path);
    }
    return out;
}

export class Importer {
    readonly source: string;
    readonly out: string;
    readonly commit: string;
    readonly model: Model;
    aws: Dict = {};
    gcp: Dict = {};
    awsCommon: Dict = {};
    gcpCommon: Dict = {};

    constructor(source: string, out: string) {
        this.source = source;
        this.out = out;
        this.commit = this.commitOf();
        this.model = new Model(source, this.commit);
    }

    private commitOf(): string {
        try {
            return execFileSync('git', ['-C', this.source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        } catch {
            return 'unknown';
        }
    }

    buildRoot(): void {
        const awsSource = this.model.sourceRef({ varsPath: AWS_VARS });
        const gcpSource = this.model.sourceRef({ varsPath: GCP_VARS });
        this.model.rootMeta = {
            kind: 'landing-zone',
            level: 0,
            cloud: 'multicloud',
            source: this.model.sourceRef({
                varsPath: AWS_VARS,
                mmd: MMD,
                extra: { 'gcp-vars': this.model.addFile(GCP_VARS) },
            }),
            provenance: {
                'generated-by': 'landingzone2calm',
                'generated-at': this.model.generatedAt,
                'importer-version': IMPORTER_VERSION,
                'source-repo': SOURCE_URL,
                'source-commit': this.commit,
                'source-license': SOURCE_LICENSE,
            },
            common: { aws: this.awsCommon, gcp: this.gcpCommon },
        };
        this.model.addNode(
            'mlz',
            'Multi-cloud landing zone',
            'ecosystem',
            null,
            {
                kind: 'landing-zone',
                level: 0,
                cloud: 'multicloud',
                source: this.model.sourceRef({ varsPath: AWS_VARS, mmd: MMD }),
            },
            'A multi-cloud, multi-region landing zone imported from its Terraform layout.',
        );
        this.model.addNode(
            'mlz-aws',
            'AWS',
            'ecosystem',
            'mlz',
            kindMeta('cloud', 1, { cloud: 'aws', provider: 'aws', owner: this.awsCommon.owner }),
            'AWS landing zone.',
        );
        this.model.addNode(
            'mlz-gcp',
            'GCP',
            'ecosystem',
            'mlz',
            kindMeta('cloud', 1, {
                cloud: 'gcp',
                provider: 'gcp',
                owner: isDict(this.gcpCommon.labels) ? this.gcpCommon.labels.owner : undefined,
            }),
            'GCP landing zone.',
        );
        this.model.addNode(
            'mlz-aws-common',
            'AWS common configuration',
            'system',
            'mlz-aws',
            kindMeta('config', 2, { cloud: 'aws', layer: 'governance', attributes: this.awsCommon, source: awsSource }),
            'AWS organization, regions and common tags.',
        );
        this.model.addNode(
            'mlz-gcp-common',
            'GCP common configuration',
            'system',
            'mlz-gcp',
            kindMeta('config', 2, { cloud: 'gcp', layer: 'governance', attributes: this.gcpCommon, source: gcpSource }),
            'GCP billing, domain, organization and labels.',
        );
    }

    buildAws(): void {
        const envs = firstDict(this.aws.Environments);
        const common = this.awsCommon;
        const defaultRegion = common.default_region ?? 'us-east-1';
        const euRegion = common.eu_region ?? 'eu-west-1';
        const tags = common.common_tags ?? {};
        const lifted = liftTags(tags);
        this.model.addNode(
            'mlz-aws-region-us',
            `AWS ${defaultRegion}`,
            'system',
            'mlz-aws',
            kindMeta('region', 2, { cloud: 'aws', region: defaultRegion, region_group: 'us', provider: 'aws', attributes: { region: defaultRegion } }),
            `AWS region ${defaultRegion}.`,
        );
        this.model.addNode(
            'mlz-aws-region-eu',
            `AWS ${euRegion}`,
            'system',
            'mlz-aws',
            kindMeta('region', 2, { cloud: 'aws', region: euRegion, region_group: 'eu', provider: 'aws', attributes: { region: euRegion } }),
            `AWS region ${euRegion}.`,
        );

        const master = firstDict(envs.master?.Resources);
        const orgUnits = firstDict(master.org_units).inputs;
        const accounts = firstDict(master.accounts).inputs;
        if (Array.isArray(orgUnits)) {
            for (const ou of orgUnits) {
                if (!isDict(ou)) continue;
                const name = String(ou.name ?? '');
                if (!name) continue;
                this.model.addNode(
                    `mlz-aws-ou-${slug(name)}`,
                    `AWS OU ${name}`,
                    'system',
                    'mlz-aws',
                    kindMeta('ou', 2, {
                        cloud: 'aws', layer: 'governance', ou: name,
                        attributes: ou, source: this.model.sourceRef({ varsPath: AWS_VARS }),
                    }),
                    `AWS organizational unit ${name}.`,
                );
            }
        }
        const accountIds: Record<string, string> = {};
        if (isDict(accounts)) {
            for (const [key, value] of Object.entries(accounts)) {
                const acc = isDict(value) ? value : {};
                const ou = inferAwsOu(key);
                const [regionGroup, env] = awsEnvParts(key);
                const accountId = `mlz-aws-account-${slug(key)}`;
                accountIds[key] = accountId;
                this.model.addNode(
                    accountId,
                    String(acc.account_name || key),
                    'system',
                    `mlz-aws-ou-${slug(ou)}`,
                    kindMeta('account', 3, {
                        cloud: 'aws', account: key,
                        account_name: acc.account_name,
                        account_email: acc.account_email,
                        ou, ou_raw: acc.ou,
                        region_group: regionGroup, env,
                        attributes: acc, source: this.model.sourceRef({ varsPath: AWS_VARS }),
                    }),
                    `AWS account ${key}.`,
                );
            }
        }

        for (const envKey of ['master', 'log-archive', 'network', 'security']) {
            const env = envs[envKey];
            if (!isDict(env)) continue;
            const envId = `mlz-aws-global-${slug(envKey)}`;
            const resources = firstDict(env.Resources);
            this.model.addNode(
                envId,
                `AWS ${envKey}`,
                'system',
                'mlz-aws',
                kindMeta('env', 3, {
                    cloud: 'aws', env: envKey, account: envKey,
                    layer: 'governance', attributes: { resources: Object.keys(resources) },
                    source: this.model.sourceRef({ varsPath: AWS_VARS }),
                }),
                `AWS global environment ${envKey}.`,
            );
            if (envKey in accountIds) this.model.addContainerRel(accountIds[envKey], envId, 'deployed-in');
            for (const [resource, spec] of Object.entries(resources)) {
                if (resource === 'accounts' && envKey === 'master') continue;
                this.buildAwsService(envId, envKey, envKey, null, null, envKey, resource, spec, null);
            }
        }

        for (const [envKey, env] of Object.entries(envs)) {
            const [regionGroup, envName] = awsEnvParts(envKey);
            if (!regionGroup || !envName || !isDict(env)) continue;
            const regionActual = regionGroup === 'us' ? defaultRegion : euRegion;
            const regionId = `mlz-aws-region-${regionGroup}`;
            const envId = `mlz-aws-env-${slug(envKey)}`;
            this.model.addNode(
                envId,
                `AWS ${envKey}`,
                'system',
                regionId,
                kindMeta('env', 4, {
                    cloud: 'aws', env: envName, account: envKey,
                    region: regionActual, region_group: regionGroup,
                    attributes: { environment: envKey },
                    source: this.model.sourceRef({ varsPath: AWS_VARS }),
                }),
                `AWS environment ${envKey} in ${regionActual}.`,
            );
            if (envKey in accountIds) this.model.addContainerRel(accountIds[envKey], envId, 'deployed-in');
            const resources = firstDict(env.Resources);
            let vpcId: string | null = null;
            for (const [resource, spec] of Object.entries(resources)) {
                const hcl = this.findAwsHcl(regionGroup, envName, resource);
                const nodeId = this.buildAwsService(envId, envKey, envName, regionActual, regionGroup, envKey, resource, spec, hcl);
                if (resource === 'vpc') vpcId = nodeId;
            }
            if (vpcId) {
                for (const resource of Object.keys(resources)) {
                    if (resource === 'vpc') continue;
                    const serviceId = `mlz-aws-${slug(envKey)}-${slug(resource)}`;
                    if (serviceId in this.model.nodes && serviceId !== vpcId) {
                        this.model.addContainerRel(vpcId, serviceId, 'deployed-in');
                    }
                }
            }
        }

        this.mergeAwsTree(envs);
    }

    buildAwsService(
        cloudParent: string,
        envKey: string,
        env: string | null,
        region: string | null,
        regionGroup: string | null,
        account: string | null,
        service: string,
        spec: any,
        hclPath: string | null,
    ): string {
        const inputs = asInputs(spec);
        const layer = layerOf(service);
        const nodeId = `mlz-aws-${slug(envKey)}-${slug(service)}`;
        const source = this.model.sourceRef({
            hcl: hclPath,
            varsPath: AWS_VARS,
            module: hclPath && existsSync(join(this.source, hclPath))
                ? hclModule(readFileSync(join(this.source, hclPath), 'utf8'))
                : null,
            resource: service,
        });
        const tags = isDict(inputs) ? firstDict(inputs).tags : null;
        const lifted = liftTags(tags);
        const { owner: _owner, ...liftedRest } = lifted;
        const meta = kindMeta('service', 5, {
            cloud: 'aws', env, account, region,
            region_group: regionGroup, service, layer,
            provider: 'aws', resource_type: service, path: hclPath,
            cidr: isDict(inputs) ? firstDict(inputs).vpc_cidr : null,
            tags, owner: lifted.owner ?? this.awsCommon.owner,
            ...liftedRest,
            attributes: inputs, source,
        });
        if (service === 'vpc') {
            return this.buildAwsVpc(cloudParent, envKey, env, region, regionGroup, account, spec, hclPath, source);
        }
        let nodeType: string;
        if (service === 'tgw') {
            nodeType = 'transit-gateway';
            meta.kind = 'tgw';
            meta.layer = 'network';
        } else {
            nodeType = nodeTypeOf(layer, 'service', service, 'aws');
        }
        this.model.addNode(
            nodeId,
            `${service} (${envKey})`,
            nodeType,
            cloudParent,
            meta,
            `${service} in AWS ${region ?? 'global'} ${envKey}.`,
        );
        if (account && account in this.model.nodes) {
            this.model.addContainerRel(`mlz-aws-account-${slug(account)}`, nodeId, 'deployed-in');
        }
        if (regionGroup) this.model.addContainerRel(`mlz-aws-region-${regionGroup}`, nodeId, 'deployed-in');
        if (service === 'iam') {
            for (const sub of ['groups', 'policies', 'roles', 'users']) {
                const hcl = this.findAwsHclPath(envKey, sub);
                this.model.addNode(
                    `${nodeId}-${sub}`,
                    `iam ${sub} (${envKey})`,
                    'service',
                    nodeId,
                    kindMeta('service', 6, {
                        cloud: 'aws', env, service: `iam-${sub}`,
                        layer: 'security', attributes: null,
                        source: this.model.sourceRef({ hcl, varsPath: AWS_VARS }),
                    }),
                    `AWS IAM ${sub}.`,
                );
            }
        }
        if (service === 'security') {
            for (const sub of ['eventbridge', 'sns', 'scp']) {
                const hcl = this.findAwsHclPath(envKey, sub);
                this.model.addNode(
                    `${nodeId}-${sub}`,
                    `security ${sub} (${envKey})`,
                    'service',
                    nodeId,
                    kindMeta('service', 6, {
                        cloud: 'aws', env, service: sub,
                        layer: sub === 'scp' ? 'security' : 'platform',
                        source: this.model.sourceRef({ hcl, varsPath: AWS_VARS }),
                    }),
                    `AWS security ${sub}.`,
                );
            }
        }
        return nodeId;
    }

    buildAwsVpc(
        parent: string,
        envKey: string,
        env: string | null,
        region: string | null,
        regionGroup: string | null,
        account: string | null,
        spec: any,
        hclPath: string | null,
        source: Dict,
    ): string {
        let inputs = asInputs(spec);
        inputs = isDict(inputs) ? inputs : {};
        const configs = inputs.vpc_configs;
        if (Array.isArray(configs) && configs.length > 0) {
            let firstId = '';
            for (const config of configs) {
                if (!isDict(config)) continue;
                const vpcName = String(config.vpc_name ?? 'vpc');
                const vpcId = `mlz-aws-vpc-${slug(vpcName)}`;
                this.model.addNode(
                    vpcId,
                    vpcName,
                    'network',
                    parent,
                    kindMeta('vpc', 5, {
                        cloud: 'aws', env, account, region,
                        region_group: regionGroup, service: 'vpc',
                        layer: 'network', cidr: config.vpc_cidr,
                        attributes: config, source,
                    }),
                    `AWS VPC ${vpcName}.`,
                );
                this.addAwsSubnets(vpcId, config, envKey, env, region, regionGroup, account, source);
                if (account && account in this.model.nodes) {
                    this.model.addContainerRel(`mlz-aws-account-${slug(account)}`, vpcId, 'deployed-in');
                }
                if (!firstId) firstId = vpcId;
            }
            return firstId;
        }
        const vpcName = String(inputs.vpc_name ?? `${envKey}-vpc`);
        const vpcId = `mlz-aws-vpc-${slug(vpcName)}`;
        this.model.addNode(
            vpcId,
            vpcName,
            'network',
            parent,
            kindMeta('vpc', 5, {
                cloud: 'aws', env, account, region,
                region_group: regionGroup, service: 'vpc',
                layer: 'network', cidr: inputs.vpc_cidr,
                attributes: inputs, source,
            }),
            `AWS VPC ${vpcName}.`,
        );
        this.addAwsSubnets(vpcId, inputs, envKey, env, region, regionGroup, account, source);
        if (account && account in this.model.nodes) {
            this.model.addContainerRel(`mlz-aws-account-${slug(account)}`, vpcId, 'deployed-in');
        }
        return vpcId;
    }

    addAwsSubnets(
        vpcId: string,
        config: Dict,
        envKey: string,
        env: string | null,
        region: string | null,
        regionGroup: string | null,
        account: string | null,
        source: Dict,
    ): void {
        const groups: Record<string, any> = {
            private: config.private_subnets,
            public: config.public_subnets,
            intra: config.intra_subnets,
            database: config.database_subnets,
            elasticache: config.elasticache_subnets,
        };
        for (const [group, values] of Object.entries(groups)) {
            if (!Array.isArray(values)) continue;
            values.forEach((cidr, index) => {
                if (typeof cidr !== 'string') return;
                const names = config[`${group}_subnet_names`];
                const name = Array.isArray(names) && index < names.length ? names[index] : `${group}-${index}`;
                const subnetId = `${vpcId}-${slug(name)}`;
                this.model.addNode(
                    subnetId,
                    name,
                    'network',
                    vpcId,
                    kindMeta('subnet', 6, {
                        cloud: 'aws', env, account, region,
                        region_group: regionGroup, service: 'subnet',
                        layer: 'network', cidr, subnet_group: group,
                        attributes: { name, cidr, group },
                        source,
                    }),
                    `AWS subnet ${name}.`,
                );
            });
        }
    }

    findAwsHcl(regionGroup: string, env: string, service: string): string | null {
        const candidate = `aws-terragrunt-configuration/aws/${service}/${regionGroup}/${env}/terragrunt.hcl`;
        return existsSync(join(this.source, candidate)) ? candidate : null;
    }

    findAwsHclPath(envKey: string, service: string): string | null {
        if (envKey.includes('-')) {
            const [regionGroup, env] = envKey.split('-', 2);
            return this.findAwsHcl(regionGroup, env, service);
        }
        for (const regionGroup of ['us', 'eu']) {
            for (const env of ['dev', 'stg', 'prod']) {
                const candidate = `aws-terragrunt-configuration/aws/${service}/${regionGroup}/${env}/terragrunt.hcl`;
                if (existsSync(join(this.source, candidate))) return candidate;
            }
        }
        return null;
    }

    mergeAwsTree(envs: Dict): void {
        const root = join(this.source, 'aws-terragrunt-configuration/aws');
        if (!existsSync(root)) return;
        for (const hcl of walkFiles(root).sort()) {
            if (!hcl.endsWith(`terragrunt.hcl`)) continue;
            const rel = relative(this.source, hcl).split(sep).join('/');
            const parts = relative(root, hcl).split(sep);
            if (parts.length < 2) continue;
            const service = parts[0];
            if (['accounts', 'terragrunt', 'vpc'].includes(service)) continue;
            let target: string | null = null;
            if (parts.length === 4) {
                const envKey = `${parts[1]}-${parts[2]}`;
                target = `mlz-aws-${slug(envKey)}-${slug(service)}`;
            } else if (parts.length === 3) {
                const sub = parts[1];
                if (service === 'iam') target = `mlz-aws-master-iam-${slug(sub)}`;
                else if (service === 'security') target = `mlz-aws-security-${slug(sub)}`;
                else if (service === 'network') target = `mlz-aws-network-${slug(sub)}`;
                else target = `mlz-aws-${slug(service)}-${slug(sub)}`;
            } else if (service === 'cloudtrail') {
                target = 'mlz-aws-log-archive-cloudtrail';
            } else if (service === 'security') {
                target = 'mlz-aws-global-security';
            } else if (service === 'network') {
                target = 'mlz-aws-global-network';
            } else if (service === 'iam') {
                target = 'mlz-aws-master-iam';
            } else {
                target = `mlz-aws-${slug(service)}`;
            }
            if (!target || !(target in this.model.nodes)) continue;
            const node = this.model.nodes[target];
            node.metadata.source = this.model.sourceRef({
                hcl: rel,
                varsPath: AWS_VARS,
                module: hclModule(readFileSync(hcl, 'utf8')),
                resource: service,
            });
            node.metadata.path = rel;
        }
        void envs;
    }

    buildGcp(): void {
        const envs = firstDict(this.gcp.envs);
        const admin = firstDict(firstDict(firstDict(envs.global?.resources).admin).inputs);
        const folders = isDict(admin.folders) ? admin.folders : {};
        const folderNodes: Record<string, string> = {};
        for (const name of Array.isArray(folders.level1) ? folders.level1 : []) {
            if (typeof name !== 'string') continue;
            const folderId = `mlz-gcp-folder-${slug(name)}`;
            folderNodes[name] = folderId;
            this.model.addNode(
                folderId,
                `GCP folder ${name}`,
                'system',
                'mlz-gcp',
                kindMeta('folder', 2, {
                    cloud: 'gcp', folder: name, layer: 'governance',
                    attributes: { name }, source: this.model.sourceRef({ varsPath: GCP_VARS }),
                }),
                `GCP folder ${name}.`,
            );
        }
        for (const item of Array.isArray(folders.level2) ? folders.level2 : []) {
            if (!isDict(item)) continue;
            const name = String(item.name ?? '');
            const parent = String(item.parent ?? '');
            if (!name) continue;
            const path = parent ? `${parent}/${name}` : name;
            const parentId = folderNodes[parent] ?? 'mlz-gcp';
            const folderId = `mlz-gcp-folder-${slug(path)}`;
            folderNodes[path] = folderId;
            this.model.addNode(
                folderId,
                `GCP folder ${path}`,
                'system',
                parentId,
                kindMeta('folder', 3, {
                    cloud: 'gcp', folder: path, layer: 'governance',
                    attributes: item, source: this.model.sourceRef({ varsPath: GCP_VARS }),
                }),
                `GCP folder ${path}.`,
            );
        }
        for (const key of ['level3', 'level4', 'level5']) {
            for (const item of Array.isArray(folders[key]) ? folders[key] : []) {
                if (!isDict(item)) continue;
                const name = String(item.name ?? '');
                const parent = String(item.parent ?? '');
                if (!name) continue;
                const path = parent ? `${parent}/${name}` : name;
                const parentId = folderNodes[parent] ?? 'mlz-gcp';
                const folderId = `mlz-gcp-folder-${slug(path)}`;
                folderNodes[path] = folderId;
                this.model.addNode(
                    folderId,
                    `GCP folder ${path}`,
                    'system',
                    parentId,
                    kindMeta('folder', 3, {
                        cloud: 'gcp', folder: path, layer: 'governance',
                        attributes: item, source: this.model.sourceRef({ varsPath: GCP_VARS }),
                    }),
                    `GCP folder ${path}.`,
                );
            }
        }

        const walk = (node: any, path: string[]): void => {
            if (!isDict(node)) return;
            if ('resources' in node && isDict(node.resources)) {
                this.buildGcpEnv(path, node);
                return;
            }
            for (const [key, child] of Object.entries(node)) walk(child, [...path, String(key)]);
        };
        walk(envs, ['gcp']);
    }

    buildGcpEnv(path: string[], node: Dict): void {
        const resources = isDict(node.resources) ? node.resources : {};
        const region = node.region;
        const segments = path.slice(1).filter(Boolean);
        const last = segments.length > 0 ? segments[segments.length - 1] : 'global';
        const previous = segments.length > 1 ? segments[segments.length - 2] : null;
        let envName = last;
        let regionGroup = gcpRegionGroup(region) ?? last;
        if ((last === 'us' || last === 'eu') && previous) {
            envName = previous;
            regionGroup = last;
        } else if ((last === 'dev' || last === 'prod') && previous) {
            envName = last;
            regionGroup = gcpRegionGroup(region) ?? last;
        } else if (last === 'global') {
            envName = 'global';
            regionGroup = 'global';
        } else if (segments.length === 1 && last === 'us') {
            envName = 'us';
            regionGroup = 'us';
        }
        const folderPath = segments.length > 0 ? segments.join('/') : 'global';
        const envId = `mlz-gcp-env-${slug(...segments)}`;
        const folderId = `mlz-gcp-folder-${slug(folderPath)}`;
        const parent = folderId in this.model.nodes ? folderId : 'mlz-gcp';
        this.model.addNode(
            envId,
            `GCP ${segments.join('/') || 'global'}`,
            'system',
            parent,
            kindMeta('env', 4, {
                cloud: 'gcp', env: envName, folder: folderPath,
                region, region_group: regionGroup,
                layer: 'governance', attributes: { path, region },
                source: this.model.sourceRef({ varsPath: GCP_VARS }),
            }),
            `GCP environment ${segments.join('/') || 'global'}.`,
        );
        if (region) {
            const regionId = `mlz-gcp-region-${slug(region)}`;
            this.model.addNode(
                regionId,
                `GCP ${region}`,
                'system',
                'mlz-gcp',
                kindMeta('region', 3, {
                    cloud: 'gcp', region, region_group: regionGroup,
                    attributes: { region },
                    source: this.model.sourceRef({ varsPath: GCP_VARS }),
                }),
                `GCP region ${region}.`,
            );
            this.model.addContainerRel(regionId, envId, 'deployed-in');
        }
        for (const [resource, spec] of Object.entries(resources)) {
            this.buildGcpService(envId, path, envName, folderPath, regionGroup, region, resource, spec);
        }
    }

    buildGcpService(
        parent: string,
        path: string[],
        envName: string,
        folderPath: string,
        regionGroup: string,
        region: any,
        service: string,
        spec: any,
    ): string {
        let inputs = asInputs(spec);
        inputs = isDict(inputs) ? inputs : {};
        const layer = layerOf(service);
        const hcl = this.findGcpHcl(path, service);
        const source = this.model.sourceRef({
            hcl,
            varsPath: GCP_VARS,
            module: hcl && existsSync(join(this.source, hcl)) ? hclModule(readFileSync(join(this.source, hcl), 'utf8')) : null,
            resource: service,
        });
        const tags = isDict(inputs.labels) ? inputs.labels : null;
        const lifted = liftTags(tags);
        const nodeId = `mlz-gcp-${slug(...path.slice(1))}-${slug(service)}`;
        if (service === 'net-vpc') {
            return this.buildGcpVpc(parent, path, envName, folderPath, regionGroup, region, service, inputs, hcl, source);
        }
        const nodeType = nodeTypeOf(layer, 'service', service, 'gcp');
        const { owner: _owner, ...liftedRest } = lifted;
        const meta = kindMeta('service', 5, {
            cloud: 'gcp', env: envName, folder: folderPath,
            region, region_group: regionGroup,
            service, layer, provider: 'gcp', resource_type: service,
            path: hcl, tags, owner: lifted.owner,
            ...liftedRest,
            attributes: inputs, source,
        });
        this.model.addNode(
            nodeId,
            `${service} (${path.slice(1).join('/')})`,
            nodeType,
            parent,
            meta,
            `${service} in GCP ${path.slice(1).join('/')}.`,
        );
        if (service === 'svc-projects') {
            const projectName = inputs.service_project_name || inputs.host_project_name;
            if (projectName) {
                const projectId = `mlz-gcp-project-${slug(projectName)}`;
                this.model.addNode(
                    projectId,
                    String(projectName),
                    'system',
                    parent,
                    kindMeta('project', 5, {
                        cloud: 'gcp', folder: folderPath, region,
                        env: envName, region_group: regionGroup,
                        service: 'project', layer: 'governance',
                        attributes: inputs, source,
                    }),
                    `GCP project ${projectName}.`,
                );
                this.model.addContainerRel(projectId, nodeId, 'deployed-in');
                this.model.nodes[nodeId].metadata.project = projectId;
            }
        }
        return nodeId;
    }

    buildGcpVpc(
        parent: string,
        path: string[],
        envName: string,
        folderPath: string,
        regionGroup: string,
        region: any,
        service: string,
        inputs: Dict,
        hcl: string | null,
        source: Dict,
    ): string {
        const vpcName = String(inputs.network_name ?? `${slug(...path)}-vpc`);
        const vpcId = `mlz-gcp-vpc-${slug(vpcName)}`;
        this.model.addNode(
            vpcId,
            vpcName,
            'network',
            parent,
            kindMeta('vpc', 5, {
                cloud: 'gcp', env: envName, folder: folderPath,
                region, region_group: regionGroup,
                service: 'net-vpc', layer: 'network', attributes: inputs, source,
                host_project: inputs.host_project_name,
            }),
            `GCP VPC ${vpcName}.`,
        );
        const subnets = inputs.subnets;
        if (Array.isArray(subnets)) {
            for (const subnet of subnets) {
                if (!isDict(subnet)) continue;
                const name = String(subnet.subnet_name ?? 'subnet');
                const cidr = subnet.subnet_ip;
                const subnetId = `${vpcId}-${slug(name)}`;
                this.model.addNode(
                    subnetId,
                    name,
                    'network',
                    vpcId,
                    kindMeta('subnet', 6, {
                        cloud: 'gcp', env: envName, folder: folderPath,
                        region: subnet.subnet_region ?? region,
                        region_group: regionGroup,
                        service: 'subnet', layer: 'network', cidr,
                        attributes: subnet, source,
                    }),
                    `GCP subnet ${name}.`,
                );
            }
        }
        const nats = inputs.cloud_nats;
        if (isDict(nats)) {
            for (const [natRegion, nat] of Object.entries(nats)) {
                if (!isDict(nat)) continue;
                const natId = `${vpcId}-nat-${slug(natRegion)}`;
                this.model.addNode(
                    natId,
                    `Cloud NAT ${natRegion}`,
                    'network',
                    vpcId,
                    kindMeta('nat', 6, {
                        cloud: 'gcp', env: envName, folder: folderPath,
                        region: natRegion, region_group: regionGroup,
                        service: 'nat', layer: 'network',
                        attributes: nat, source,
                    }),
                    `Cloud NAT in ${natRegion}.`,
                );
            }
        }
        return vpcId;
    }

    findGcpHcl(path: string[], service: string): string | null {
        const parts = path.slice(1).filter(Boolean);
        if (parts.length === 0) return null;
        const candidates: string[] = [];
        if (parts.length >= 2) {
            candidates.push(`gcp-terragrunt-configuration/terragrunt/envs/${[...parts.slice(0, -1), service].join('/')}/terragrunt.hcl`);
        }
        candidates.push(`gcp-terragrunt-configuration/terragrunt/envs/${[...parts, service].join('/')}/terragrunt.hcl`);
        for (const candidate of candidates) {
            if (existsSync(join(this.source, candidate))) return candidate;
        }
        return null;
    }

    buildMermaid(): void {
        const path = join(this.source, MMD);
        if (!existsSync(path)) return;
        const [nodes, edges] = parseMermaid(readFileSync(path, 'utf8'));
        const idMap: Record<string, string> = {};
        for (const node of nodes) {
            const rawId = node.id;
            const label = node.label;
            const [name, cidrOrPrefix] = labelParts(label);
            if (!name) continue;
            const cloud = node.cloud || 'aws';
            if (name.toLowerCase().includes('vpc')) {
                const vpcId = `mlz-${cloud}-vpc-${slug(name)}`;
                const parent = cloud === 'aws' ? 'mlz-aws' : 'mlz-gcp';
                let regionGroup: string | null = null;
                let envName: string | null = null;
                if (label.includes('/')) {
                    const parts = label.split(':', 1)[0].split('/');
                    if (parts.length >= 2) {
                        envName = parts[parts.length - 1];
                        regionGroup = parts[parts.length - 2];
                    }
                }
                this.model.addNode(
                    vpcId,
                    name,
                    'network',
                    parent,
                    kindMeta('vpc', 5, {
                        cloud, env: envName, region_group: regionGroup,
                        service: 'vpc', layer: 'network',
                        cidr: cidrOrPrefix && String(cidrOrPrefix).includes('/') ? cidrOrPrefix : null,
                        mmd: { node },
                        source: this.model.sourceRef({ mmd: MMD }),
                    }),
                    `${cloud.toUpperCase()} VPC ${name}.`,
                );
                idMap[rawId] = vpcId;
            } else if (name.toLowerCase().includes('transit gateway')) {
                const tgwId = 'mlz-aws-network-tgw' in this.model.nodes ? 'mlz-aws-network-tgw' : 'mlz-aws-tgw-mmd';
                if (!(tgwId in this.model.nodes)) {
                    this.model.addNode(
                        tgwId,
                        name,
                        'transit-gateway',
                        'mlz-aws',
                        kindMeta('tgw', 4, {
                            cloud: 'aws', service: 'tgw', layer: 'network',
                            mmd: { node },
                            source: this.model.sourceRef({ mmd: MMD }),
                        }),
                        `AWS transit gateway ${name}.`,
                    );
                }
                idMap[rawId] = tgwId;
            } else {
                idMap[rawId] = '';
            }
        }
        for (const edge of edges) {
            const source = idMap[edge.source];
            const target = idMap[edge.target];
            if (!source || !target) continue;
            this.model.addConnects(
                source,
                target,
                `${edge.kind} from ${edge.source} to ${edge.target}`,
                {
                    kind: edge.kind,
                    mmd: edge,
                    source: this.model.sourceRef({ mmd: MMD }),
                },
            );
        }
    }

    buildReport(): void {
        const path = join(this.source, REPORT);
        if (!existsSync(path)) return;
        let report: Dict;
        try {
            report = JSON.parse(readFileSync(path, 'utf8'));
        } catch {
            return;
        }
        this.model.rootMeta.compliance = {
            'source-assessment': true,
            source: this.model.sourceRef({ extra: { file: REPORT } }),
            generator: report.generator,
            'generated-at': report.generated_at,
            score: report.score,
            grade: report.grade,
            totals: report.totals,
            checks: report.checks ?? [],
        };
    }

    write(): Dict {
        this.aws = loadYaml(join(this.source, AWS_VARS));
        this.gcp = loadYaml(join(this.source, GCP_VARS));
        this.awsCommon = firstDict(this.aws.common);
        this.gcpCommon = firstDict(this.gcp.common);
        this.buildRoot();
        this.buildAws();
        this.buildGcp();
        this.buildMermaid();
        this.buildReport();
        mkdirSync(this.out, { recursive: true });
        const modelPath = join(this.out, 'multicloud-landing-zone.architecture.json');
        const document = this.model.document();
        writeFileSync(modelPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
        return {
            model: modelPath,
            nodes: document.nodes.length,
            relationships: document.relationships.length,
            model_bytes: statSync(modelPath).size,
        };
    }
}

export function validate(modelPath: string): string[] {
    const document = JSON.parse(readFileSync(modelPath, 'utf8')) as Dict;
    const errors: string[] = [];
    const ids = new Set<string>();
    for (const node of document.nodes ?? []) {
        const nodeId = node['unique-id'];
        if (!nodeId) {
            errors.push('node without unique-id');
            continue;
        }
        if (ids.has(nodeId)) errors.push(`duplicate node id: ${nodeId}`);
        ids.add(nodeId);
        for (const key of ['node-type', 'name', 'description']) {
            if (!node[key]) errors.push(`node ${nodeId} missing ${key}`);
        }
    }
    const relIds = new Set<string>();
    for (const rel of document.relationships ?? []) {
        const relId = rel['unique-id'];
        if (!relId) {
            errors.push('relationship without unique-id');
            continue;
        }
        if (relIds.has(relId)) errors.push(`duplicate relationship id: ${relId}`);
        relIds.add(relId);
        const kind = rel['relationship-type'] ?? {};
        if (!isDict(kind) || Object.keys(kind).length !== 1) {
            errors.push(`relationship ${relId} has an invalid relationship-type`);
            continue;
        }
        const [name, body] = Object.entries(kind)[0] as [string, any];
        if (!isDict(body)) {
            errors.push(`relationship ${relId} has an invalid body`);
            continue;
        }
        if (name === 'composed-of' || name === 'deployed-in') {
            if (!ids.has(body.container)) errors.push(`relationship ${relId} container ${body.container} does not exist`);
            if (!Array.isArray(body.nodes)) {
                errors.push(`relationship ${relId} nodes is not a list`);
            } else {
                for (const child of body.nodes) {
                    if (!ids.has(child)) errors.push(`relationship ${relId} child ${child} does not exist`);
                }
            }
        } else if (name === 'connects') {
            for (const side of ['source', 'destination']) {
                const endpoint = isDict(body[side]) ? body[side].node : null;
                if (!ids.has(endpoint)) errors.push(`relationship ${relId} ${side} ${endpoint} does not exist`);
            }
        } else {
            errors.push(`relationship ${relId} uses unsupported type ${name}`);
        }
    }
    return errors;
}

function parseArgs(argv: string[]): { source: string; out: string } {
    let source = DEFAULT_SOURCE;
    let out = DEFAULT_OUT;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--source' && index + 1 < argv.length) source = argv[++index];
        else if (arg.startsWith('--source=')) source = arg.slice('--source='.length);
        else if (arg === '--out' && index + 1 < argv.length) out = argv[++index];
        else if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
        else {
            console.error(`unknown argument: ${arg}`);
            process.exit(2);
        }
    }
    return { source: resolve(source), out: resolve(out) };
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));
    if (!existsSync(join(args.source, AWS_VARS))) {
        console.error(`source vars not found: ${join(args.source, AWS_VARS)}`);
        process.exit(1);
    }
    const importer = new Importer(args.source, args.out);
    const result = importer.write();
    const errors = validate(result.model as string);
    console.log(JSON.stringify({ ...result, errors: errors.slice(0, 20), error_count: errors.length }, null, 2));
    if (errors.length > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
