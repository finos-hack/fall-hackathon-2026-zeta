import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ajv2020 = require('ajv/dist/2020') as new (opts?: Record<string, unknown>) => {
    compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: unknown };
};

const HERE = dirname(fileURLToPath(import.meta.url));
const POC = join(HERE, '..', '..', '..');

describe('views conform to schema/view.json under real Ajv 2020-12', () => {
    const viewsDir = join(POC, 'views');
    const files = readdirSync(viewsDir).filter((x) => x.endsWith('.calm-view.json')).sort();
    assert.equal(files.length, 5);
    for (const f of files) {
        it(`${f} validates`, () => {
            const ajv = new Ajv2020({ strict: true });
            const schema = JSON.parse(readFileSync(join(POC, 'schema', 'view.json'), 'utf8'));
            const validate = ajv.compile(schema);
            const view = JSON.parse(readFileSync(join(viewsDir, f), 'utf8'));
            assert.equal(validate(view), true, JSON.stringify(validate.errors));
        });
    }
});
