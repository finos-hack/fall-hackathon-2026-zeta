import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultViewsDir } from '../paths.js';

describe('defaultViewsDir', () => {
    it('resolves to poc/views from the extension dist folder', () => {
        assert.equal(
            defaultViewsDir('/repo/poc/hub-extensions/calm-views/dist'),
            '/repo/poc/views',
        );
    });
});
