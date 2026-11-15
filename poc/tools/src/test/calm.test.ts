import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pyFloat0, ensureAscii, escXml, resolveView, type CalmArchitecture } from '../calm.js';

describe('pyFloat0 (banker rounding like Python :.0f)', () => {
    it('rounds halves to even', () => {
        assert.equal(pyFloat0(2.5), '2');
        assert.equal(pyFloat0(3.5), '4');
        assert.equal(pyFloat0(0.5), '0');
        assert.equal(pyFloat0(1.5), '2');
    });
    it('rounds normal values', () => {
        assert.equal(pyFloat0(2.4), '2');
        assert.equal(pyFloat0(2.6), '3');
        assert.equal(pyFloat0(65), '65');
        assert.equal(pyFloat0(111.5 - 0), '112');
    });
});

describe('ensureAscii (like Python json.dump default)', () => {
    it('escapes non-ascii, keeps ascii', () => {
        assert.equal(ensureAscii('—'), '\\u2014');
        assert.equal(ensureAscii('a:b,c'), 'a:b,c');
    });
});

describe('escXml (like Python xml.sax, no quote escaping)', () => {
    it('escapes & < > only', () => {
        assert.equal(escXml('a&b<c>d"e'), 'a&amp;b&lt;c&gt;d"e');
    });
});

describe('resolveView (mirrors Python validate.resolve_view)', () => {
    const arch = {
        nodes: [
            { 'unique-id': 'a', 'node-type': 'service' },
            { 'unique-id': 'b', 'node-type': 'service' },
            { 'unique-id': 'db', 'node-type': 'database' },
        ],
        relationships: [
            { 'unique-id': 'r1', 'relationship-type': { connects: { source: { node: 'a' }, destination: { node: 'b' } } } },
            { 'unique-id': 'r2', 'relationship-type': { connects: { source: { node: 'b' }, destination: { node: 'db' } } } },
        ],
    } as unknown as CalmArchitecture;
    it('selects listed nodes, closes relationships with all endpoints in', () => {
        const { inNodes, inRels } = resolveView(arch, { nodes: ['a', 'b'] });
        assert.deepEqual([...inNodes].sort(), ['a', 'b']);
        assert.ok(inRels.has('r1'));
        assert.ok(!inRels.has('r2'));
    });
    it('selects by node-type and warns on unknown ids', () => {
        const { inNodes, warnings } = resolveView(arch, { 'node-types': ['database'], nodes: ['nope'] });
        assert.deepEqual([...inNodes].sort(), ['db', 'nope']);
        assert.ok(warnings.some((w) => w.includes('nope')));
    });
});
