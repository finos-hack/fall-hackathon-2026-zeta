#!/usr/bin/env node
/** Convert an ArchiMate tool model (.archimate XML) into a CALM architecture.
 *
 * Usage: node archimate.js IN.archimate --out OUT.architecture.json [--prefix PREFIX]
 *
 * Element mapping (ArchiMate -> CALM node-type):
 *   BusinessActor/Role/Collaboration          -> actor
 *   *Service/*Process/*Function/*Interaction/
 *    *Event/ApplicationComponent              -> service
 *   Device/Node/SystemSoftware/Network        -> system
 *   BusinessObject/DataObject/Representation/
 *    Contract/Value                           -> database
 *   Principle, Group and diagram elements -> skipped (not architecture)
 *
 * Relationship mapping (-> CALM relationship-type):
 *   Composition/Aggregation/Assignment/
 *    Specialisation                           -> composed-of
 *   Association                                -> interacts
 *   Flow/Triggering/UsedBy/Access/Realisation -> connects
 *
 * Spike: lossy by design (diagrams, viewpoints and styling stay in Archi).
 * Every id is preserved as PREFIX + archi id for traceability.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { ROOT, writeText, dumpJson } from './calm.js';

const ACTORS = new Set([
    'BusinessActor',
    'BusinessRole',
    'BusinessCollaboration',
    'BusinessInterface',
]);
const SERVICES = new Set([
    'BusinessService',
    'BusinessProcess',
    'BusinessFunction',
    'BusinessInteraction',
    'BusinessEvent',
    'ApplicationComponent',
    'ApplicationFunction',
    'ApplicationService',
    'ApplicationInterface',
]);
const SYSTEMS = new Set(['Device', 'Node', 'SystemSoftware', 'Network', 'InfrastructureService', 'InfrastructureFunction']);
const DATA = new Set(['BusinessObject', 'DataObject', 'Representation', 'Contract', 'Value', 'Meaning']);

const STRUCTURAL = new Set([
    'CompositionRelationship',
    'AggregationRelationship',
    'AssignmentRelationship',
    'SpecialisationRelationship',
]);

function nodeType(archiType: string): string | null {
    if (ACTORS.has(archiType)) return 'actor';
    if (SERVICES.has(archiType)) return 'service';
    if (SYSTEMS.has(archiType)) return 'system';
    if (DATA.has(archiType)) return 'database';
    return null;
}

function relKind(archiType: string): string {
    if (STRUCTURAL.has(archiType)) return 'composed-of';
    if (archiType === 'AssociationRelationship') return 'interacts';
    return 'connects';
}

function attr(tag: string, name: string): string {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`));
    return m ? (m[1] as string) : '';
}

interface Args {
    input: string;
    out: string;
    prefix: string;
}

function parseArgs(argv: string[]): Args {
    const a: Args = { input: '', out: '', prefix: 'archi' };
    const rest: string[] = [];
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--out') a.out = argv[++i] as string;
        else if (argv[i] === '--prefix') a.prefix = argv[++i] as string;
        else rest.push(argv[i] as string);
    }
    a.input = rest[0] ?? '';
    if (!a.input || !a.out) {
        console.error('usage: node archimate.js IN.archimate --out OUT.architecture.json [--prefix PREFIX]');
        process.exit(2);
    }
    return a;
}

function main(): void {
    const args = parseArgs(process.argv);
    const xml = readFileSync(resolve(args.input), 'utf8');
    const p = args.prefix;

    // Token walk keeps the folder path of every element. Same (type, name)
    // twice is the same concept filed in two folders -> merge. Same name
    // with another type (Customer the role vs Customer the file) stays
    // separate, with the folder path in the description.
    const stack: { name: string; id: string }[] = [];
    interface El {
        type: string;
        id: string;
        name: string;
        folders: string;
    }
    const elements: El[] = [];
    const token = /<folder\s+name="([^"]*)"(?:\s+id="([^"]*)")?[^>]*>|<\/folder>|<element\s+xsi:type="archimate:([A-Za-z]+)"([^>]*)\/>/g;
    for (const m of xml.matchAll(token)) {
        if (m[0] === '</folder>') stack.pop();
        else if (m[1] !== undefined) stack.push({ name: m[1], id: m[2] ?? '' });
        else if (m[3] !== undefined) {
            elements.push({
                type: m[3],
                id: attr(m[4], 'id'),
                name: attr(m[4], 'name'),
                folders: stack.map((f) => f.name).join(' / '),
            });
        }
    }

    const nodes: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    const merged = new Map<string, string>(); // archi id -> surviving unique-id
    const byTypeName = new Map<string, El[]>();
    for (const e of elements) {
        if (!nodeType(e.type) || !e.id) continue;
        const key = `${e.type}\u0000${e.name || e.id}`;
        if (!byTypeName.has(key)) byTypeName.set(key, []);
        (byTypeName.get(key) as El[]).push(e);
    }
    for (const group of byTypeName.values()) {
        const first = group[0] as El;
        const uid = `${p}-${first.id}`;
        const extra =
            group.length > 1
                ? ` Appears ${group.length} times in Archi (${group.map((g) => g.folders).join('; ')}); merged into one node.`
                : '';
        nodes.push({
            'unique-id': uid,
            'node-type': nodeType(first.type),
            name: first.name || first.id,
            description:
                `ArchiMate ${first.type} from ${first.folders} (imported from ${basename(args.input)}).` + extra,
            metadata: {
                'archimate-type': first.type,
                'archimate-layer': first.folders.split(' / ')[0] ?? '',
                'archimate-folders': first.folders,
            },
        });
        seen.add(first.id);
        for (const e of group) {
            seen.add(e.id);
            merged.set(e.id, uid);
        }
    }

    const relationships: Record<string, unknown>[] = [];
    for (const m of xml.matchAll(/<element\s+xsi:type="archimate:([A-Za-z]*Relationship)"([^>]*)\/>/g)) {
        const type = m[1] as string;
        const id = attr(m[0], 'id');
        const source = attr(m[0], 'source');
        const target = attr(m[0], 'target');
        const name = attr(m[0], 'name');
        if (!id || !source || !target || !merged.has(source) || !merged.has(target)) continue;
        const kind = relKind(type);
        const src = merged.get(source) as string;
        const dst = merged.get(target) as string;
        relationships.push({
            'unique-id': `${p}-rel-${id}`,
            'relationship-type': {
                [kind]: { source: { node: src }, destination: { node: dst } },
            },
            ...(name ? { description: `${name} (ArchiMate ${type})` } : { description: `ArchiMate ${type}` }),
        });
    }

    const title = basename(args.input).replace(/\.archimate$/, '');
    const doc = {
        $schema: 'https://calm.finos.org/release/1.3/meta/architecture.json',
        'unique-id': `${p}-architecture`,
        title,
        description: `Imported from ArchiMate (${basename(args.input)}): ${nodes.length} nodes, ${relationships.length} relationships. Lossy: diagrams, viewpoints and styling stay in Archi.`,
        nodes,
        relationships,
    };
    void ROOT;
    writeText(resolve(args.out), dumpJson(doc) + '\n');
    console.log(`${title}: ${nodes.length} nodes, ${relationships.length} relationships -> ${args.out}`);
}

main();
