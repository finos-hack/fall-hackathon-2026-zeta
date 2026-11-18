import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checkSchema, main as validateMain } from '../validate.js';
import { listViewFiles } from '../calm.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ajv2020 = require('ajv/dist/2020') as new (opts?: Record<string, unknown>) => {
    compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: unknown };
};

const HERE = dirname(fileURLToPath(import.meta.url));
const POC = join(HERE, '..', '..', '..');

describe('views conform to schema/view.json under real Ajv 2020-12', () => {
    const viewsDir = join(POC, 'views');
    const files = listViewFiles(viewsDir);
    assert.ok(files.length >= 11);
    assert.ok(files.includes('multicloud-landing-zone/multicloud-global.calm-view.json'));
    for (const f of files) {
        it(`${f} validates`, () => {
            const ajv = new Ajv2020({ strict: true });
            const schema = JSON.parse(readFileSync(join(POC, 'schema', 'view.json'), 'utf8'));
            const validate = ajv.compile(schema);
            const view = JSON.parse(readFileSync(join(viewsDir, f), 'utf8'));
            assert.equal(validate(view), true, JSON.stringify(validate.errors));
        });
    }
    it('rejects a view missing unique-id (enforcement, not just acceptance)', () => {
        const ajv = new Ajv2020({ strict: true });
        const schema = JSON.parse(readFileSync(join(POC, 'schema', 'view.json'), 'utf8'));
        const validate = ajv.compile(schema);
        const broken = JSON.parse(readFileSync(join(viewsDir, files[0] as string), 'utf8')) as Record<string, unknown>;
        delete broken['unique-id'];
        assert.equal(validate(broken), false);
    });

    it('rejects a view without filter in both Ajv and the CLI validator', () => {
        const ajv = new Ajv2020({ strict: true });
        const schema = JSON.parse(readFileSync(join(POC, 'schema', 'view.json'), 'utf8'));
        const validate = ajv.compile(schema);
        const view = JSON.parse(readFileSync(join(viewsDir, files[0] as string), 'utf8')) as Record<string, unknown>;
        delete view.filter;
        assert.equal(validate(view), false);
        assert.match(checkSchema(view) ?? '', /'filter' is a required property/);
    });

    it('reports malformed JSON and missing multi-file targets without a stack trace', () => {
        const root = mkdtempSync(join(tmpdir(), 'calm-validate-errors-'));
        const views = join(root, 'views');
        mkdirSync(views, { recursive: true });
        mkdirSync(join(root, 'schema'), { recursive: true });
        writeFileSync(join(root, 'schema', 'view.json'), readFileSync(join(POC, 'schema', 'view.json')));
        writeFileSync(join(views, 'broken.calm-view.json'), '{ this is not JSON');
        writeFileSync(join(views, 'missing.calm-view.json'), JSON.stringify({
            'unique-id': 'missing-model',
            name: 'Missing model',
            for: ['../model/not-here.architecture.json'],
            filter: {},
        }));
        const messages: string[] = [];
        try {
            assert.equal(validateMain(root, (message) => messages.push(String(message))), 1);
            assert.ok(messages.some((line) => line.includes('broken.calm-view.json: SCHEMA ERROR: invalid JSON')));
            assert.ok(messages.some((line) => line.includes('missing.calm-view.json: ERROR: `for` target(s) missing')));
            assert.equal(messages.some((line) => /^\s+at /.test(line)), false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
