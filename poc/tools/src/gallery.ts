#!/usr/bin/env node
/** Build gallery.html: one self-contained page embedding every rendered view.
 *
 * Usage: node gallery.js [--out DIR]
 * Reads *-scoped.json + *.svg + *.md produced by render. SVGs are inlined so the
 * page works from file:// with no server and no network. Same selection, second
 * presentation — evidence that the view file is renderer-neutral.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { ROOT, readJson, writeText, type JsonRecord } from './calm.js';

export function main(): void {
    const argv = process.argv.slice(2);
    let out = join(ROOT, 'renders');
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--out' && i + 1 < argv.length) out = argv[++i] as string;
        else {
            console.error(`unknown argument: ${argv[i]}`);
            process.exit(2);
        }
    }
    const rendersDir = normalize(out);
    const inDir = join(ROOT, 'renders');
    const groupOf = new Map<string, string>();
    const derivedOf = new Set<string>();
    for (const f of readdirSync(join(ROOT, 'views')).filter((x: string) => x.endsWith('.calm-view.json'))) {
        try {
            const v = readJson(join(ROOT, 'views', f)) as JsonRecord;
            const id = v['unique-id'] as string;
            if (typeof v['group'] === 'string') groupOf.set(id, v['group'] as string);
            if (v['derived-from']) derivedOf.add(id);
        } catch {
            /* validated separately */
        }
    }
    const cards: string[] = [];
    let viewCount = 0;
    let lastGroup = '';
    const scopedFiles = readdirSync(inDir)
        .filter((f) => f.endsWith('-scoped.json'))
        .sort()
        .map((f) => join(inDir, f));
    for (const sp of scopedFiles) {
        const scoped = readJson(sp) as JsonRecord;
        const vid = scoped['view'] as string;
        const svgPath = join(inDir, vid + '.svg');
        let svg: string;
        try {
            svg = readFileSync(svgPath, 'utf8');
        } catch {
            svg = '<p>(no diagram)</p>';
        }
        const md = vid + '.md';
        const group = groupOf.get(vid) ?? 'Ungrouped';
        const derived = derivedOf.has(vid) ? ' · derived' : '';
        viewCount += 1;
        if (group !== lastGroup) {
            cards.push(`<h2>${group}</h2>`);
            lastGroup = group;
        }
        cards.push(
            `<section><h3>${vid}${derived}</h3>` +
                `<p>${(scoped['nodes'] as unknown[]).length} nodes, ` +
                `${(scoped['relationships'] as unknown[]).length} relationships, ` +
                `${((scoped['decorators'] as unknown[]) ?? []).length} decorators — ` +
                `source: <code>${scoped['for'] as string}</code> (unmodified). ` +
                `Prose: <a href="${md}">${md}</a></p>` +
                `<div class="diagram">${svg}</div></section>`
        );
    }
    const html =
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
        '<title>CALM Views POC — gallery</title>' +
        '<style>body{font-family:sans-serif;max-width:1100px;margin:auto;padding:1em}' +
        '.diagram{border:1px solid #94a3b8;border-radius:8px;overflow:auto;background:#fff}' +
        '.diagram svg{max-width:none}section{margin-bottom:3em}</style></head><body>' +
        '<h1>CALM Views POC — one model, three audiences</h1>' +
        '<p>Each view below is a <code>*.calm-view.json</code> sidecar selecting from the same ' +
        'unmodified architecture. Same selection, second presentation (alongside the Markdown ' +
        'prose): the view file is renderer-neutral.</p>' +
        cards.join('\n') +
        '</body></html>\n';
    writeText(join(rendersDir, 'gallery.html'), html);
    console.log(`gallery.html: ${viewCount} views embedded`);
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('/gallery.js') || invoked.endsWith('\\gallery.js')) {
    main();
}
