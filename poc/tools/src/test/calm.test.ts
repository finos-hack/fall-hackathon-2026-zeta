import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pyFloat0, ensureAscii, escXml, resolveView, type CalmArchitecture } from '../calm.js';
import { checkDrill } from '../validate.js';

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

describe('checkDrill (errors, not warnings)', () => {
    const byId = new Map([
        ['child-view', { file: 'child.calm-view.json', for: '../model/m.json' }],
        ['other-model-view', { file: 'o.calm-view.json', for: '../other/m.json' }],
    ]);
    it('accepts a target on the same model with the node in view', () => {
        assert.deepEqual(checkDrill({ n1: 'child-view' }, new Set(['n1']), byId, '../model/m.json'), []);
    });
    it('errors on missing target, foreign model and node outside the view', () => {
        const errs = checkDrill(
            { n1: 'nope', n2: 'other-model-view', n3: 'child-view' },
            new Set(['n1', 'n2']),
            byId,
            '../model/m.json'
        );
        assert.equal(errs.length, 3);
        assert.ok(errs.some((e) => e.includes("'nope'")));
        assert.ok(errs.some((e) => e.includes("'other-model-view'")));
        assert.ok(errs.some((e) => e.includes("'n3'")));
    });
});

describe('edge lifting (endpoints rise to the nearest visible container)', () => {
    const arch = {
        nodes: [
            { 'unique-id': 'box', 'node-type': 'system' },
            { 'unique-id': 'in-a', 'node-type': 'service' },
            { 'unique-id': 'in-b', 'node-type': 'service' },
            { 'unique-id': 'out', 'node-type': 'service' },
        ],
        relationships: [
            { 'unique-id': 'c1', 'relationship-type': { 'composed-of': { container: 'box', nodes: ['in-a', 'in-b'] } } },
            { 'unique-id': 'r1', 'relationship-type': { connects: { source: { node: 'in-a' }, destination: { node: 'out' } } } },
            { 'unique-id': 'r2', 'relationship-type': { connects: { source: { node: 'out' }, destination: { node: 'nope' } } } },
        ],
    } as unknown as CalmArchitecture;
    it('lifts a hidden endpoint to the visible container', () => {
        const { inNodes, inRels, liftedEndpoints } = resolveView(arch, { nodes: ['box', 'out'] });
        assert.ok(inRels.has('r1'));
        assert.deepEqual(liftedEndpoints.get('r1'), ['box', 'out']);
        assert.ok(!inRels.has('r2'));
        assert.deepEqual([...inNodes].sort(), ['box', 'out']);
    });
    it('drops relationships that collapse to a self-loop', () => {
        const { inRels, excluded } = resolveView(arch, { nodes: ['box'] });
        assert.ok(!inRels.has('c1'));
        assert.ok(excluded.has('c1'));
        assert.deepEqual(excluded.get('c1'), ['in-a', 'in-b']);
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
