#!/usr/bin/env node
/** Pack a *.calm-view.json sidecar as a Hub decorator envelope and back.
 *
 * Usage: node pack.js <view-file> --arch-id <id> [--out FILE]
 *        node pack.js --unpack <decorator-file>
 *
 * The same document travels as a file in the repo or as a decorator in the
 * Hub: type "view", applies-to = filter nodes, target = architecture id,
 * full sidecar (audience, filter, description, suggested-formats,
 * derived-from, drill-down) inside data. Evidence for both sides of #2344.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, normalize, resolve } from 'node:path';
import { ROOT, readJson, writeText, dumpJson, resolveView, type JsonRecord, type CalmArchitecture, type CalmFilter } from './calm.js';

export function packSidecar(view: JsonRecord, arch: CalmArchitecture, archId: string): JsonRecord {
    const filt = (view['filter'] as CalmFilter | undefined) ?? {};
    const { inNodes } = resolveView(arch, filt);
    return {
        '$schema': 'https://calm.finos.org/release/1.3/meta/decorators.json#/defs/decorator',
        'unique-id': `${view['unique-id'] as string}-as-decorator`,
        type: 'view',
        target: [archId],
        'target-type': ['architecture'],
        'applies-to': [...inNodes].sort(),
        data: {
            name: view['name'],
            description: view['description'],
            audience: view['audience'] ?? [],
            filter: view['filter'] ?? {},
            'suggested-formats': view['suggested-formats'] ?? [],
            'derived-from': view['derived-from'] ?? null,
            'drill-down': view['drill-down'] ?? {},
        },
    };
}

export function unpackSidecar(decorator: JsonRecord): JsonRecord {
    const data = (decorator['data'] as JsonRecord | undefined) ?? {};
    return {
        '$schema': '../schema/view.json',
        'unique-id': String(decorator['unique-id'] as string).replace(/-as-decorator$/, ''),
        name: data['name'],
        description: data['description'],
        audience: data['audience'],
        'suggested-formats': data['suggested-formats'],
        ...(data['derived-from'] ? { 'derived-from': data['derived-from'] } : {}),
        ...(Object.keys((data['drill-down'] as JsonRecord | undefined) ?? {}).length > 0
            ? { 'drill-down': data['drill-down'] }
            : {}),
        for: '../model/fluxnova-kyc-onboarding.architecture.json',
        filter: data['filter'],
    };
}

function usage(): never {
    console.error('usage: node pack.js <view-file> --arch-id <id> [--out FILE] | node pack.js --unpack <decorator-file>');
    process.exit(2);
}

export function main(): void {
    const argv = process.argv.slice(2);
    if (argv[0] === '--unpack' && argv[1]) {
        const view = unpackSidecar(readJson(argv[1]) as JsonRecord);
        console.log(dumpJson(view));
        return;
    }
    const file = argv[0];
    const ai = argv.indexOf('--arch-id');
    const oi = argv.indexOf('--out');
    if (!file || ai < 0 || !argv[ai + 1]) usage();
    const viewPath = file as string;
    const view = readJson(viewPath) as JsonRecord;
    const archPath = normalize(join(dirname(resolve(viewPath)), view['for'] as string));
    const dec = packSidecar(view, readJson(archPath) as CalmArchitecture, argv[ai + 1] as string);
    const text = dumpJson(dec) + '\n';
    if (oi >= 0 && argv[oi + 1]) {
        writeText(argv[oi + 1] as string, text);
        console.log(`packed -> ${argv[oi + 1]}`);
    } else {
        console.log(text);
    }
    void ROOT;
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('/pack.js') || invoked.endsWith('\\pack.js')) {
    main();
}
