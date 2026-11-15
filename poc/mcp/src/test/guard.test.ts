import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isReadOnlyQuery } from '../db.js';

describe('isReadOnlyQuery', () => {
    it('allows select/with/values/explain/show', () => {
        assert.ok(isReadOnlyQuery('SELECT * FROM nodes'));
        assert.ok(isReadOnlyQuery('  with x as (select 1) select * from x'));
        assert.ok(isReadOnlyQuery('VALUES (1, 2)'));
        assert.ok(isReadOnlyQuery('EXPLAIN SELECT 1'));
        assert.ok(isReadOnlyQuery('SHOW TABLES'));
        assert.ok(isReadOnlyQuery('show columns from nodes'));
    });
    it('rejects writes and stacked statements', () => {
        for (const q of [
            'DROP TABLE nodes',
            'DELETE FROM nodes',
            'INSERT INTO views VALUES (1)',
            'UPDATE nodes SET type=1',
            'SELECT 1; DROP TABLE views',
            'PRAGMA database_list',
        ]) {
            assert.ok(!isReadOnlyQuery(q), q);
        }
    });
});
