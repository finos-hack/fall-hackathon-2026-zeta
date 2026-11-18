import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..');
const POC = join(HERE, '..', '..', '..');
const node = process.execPath;

describe('archimate: ArchiMate XML converts to a CALM architecture', () => {
    it('converts the mini fixture with layers in metadata and no dangling refs', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'calm-archimate-'));
        const out = join(tmp, 'mini.architecture.json');
        execFileSync(node, [join(DIST, 'archimate.js'), join(POC, 'fixtures', 'archimate-mini.archimate'), '--out', out, '--prefix', 'mini'], { encoding: 'utf8' });
        const a = JSON.parse(readFileSync(out, 'utf8')) as {
            nodes: Array<{ 'unique-id': string; metadata?: Record<string, string> }>;
            relationships: Array<{ 'unique-id': string; 'relationship-type': Record<string, unknown> }>;
        };
        assert.equal(a.nodes.length, 10);
        assert.equal(a.relationships.length, 6);
        const layers = new Set(a.nodes.map((n) => n.metadata?.['archimate-layer']));
        assert.deepEqual([...layers].sort(), ['Application', 'Business', 'Technology']);
        const ids = new Set(a.nodes.map((n) => n['unique-id']));
        const endpoints = (r: Record<string, unknown>): string[] => {
            const rt = r['relationship-type'] as Record<string, Record<string, unknown>>;
            const k = Object.keys(rt)[0] as string;
            const body = rt[k] as { source?: { node?: string }; destination?: { node?: string }; container?: string; nodes?: string[] };
            if (k === 'composed-of') return [body.container, ...(body.nodes ?? [])].filter((x): x is string => !!x);
            return [body.source?.node, body.destination?.node].filter((x): x is string => !!x);
        };
        const composed = a.relationships.filter((r) => 'composed-of' in r['relationship-type']);
        assert.ok(composed.length > 0, 'fixture has composition relationships');
        for (const r of composed) {
            const body = r['relationship-type']['composed-of'] as { container?: string; nodes?: string[] };
            assert.ok(body.container && Array.isArray(body.nodes) && body.nodes.length > 0, `composed-of shape in ${r['unique-id']}`);
        }
        for (const r of a.relationships) {
            for (const e of endpoints(r as unknown as Record<string, unknown>)) {
                assert.ok(ids.has(e), `dangling endpoint ${e} in ${r['unique-id']}`);
            }
        }
    });
});
