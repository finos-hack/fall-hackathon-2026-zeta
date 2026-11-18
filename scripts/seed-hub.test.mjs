import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedHub } from './seed-hub.mjs';

test('seedHub creates headers, adds missing versions and writes dynamic POC links', async () => {
    const architectures = [];
    const calls = [];
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
        calls.push({ method: req.method, path: url.pathname, body });
        const send = (status, data, headers = {}) => {
            res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
            res.end(data === undefined ? '' : JSON.stringify(data));
        };

        if (req.method === 'POST' && url.pathname === '/api/calm/namespaces') return send(409, { error: 'exists' });
        if (req.method === 'GET' && url.pathname === '/api/calm/namespaces/finos/architectures') {
            return send(200, { values: architectures.map(({ id, name }) => ({ id, name })) });
        }
        if (req.method === 'POST' && url.pathname === '/api/calm/namespaces/finos/architectures') {
            const id = String(architectures.length + 1);
            architectures.push({ id, name: body.name, document: body.architectureJson, versions: ['1.0.0'] });
            return send(201, undefined, { Location: `/api/calm/namespaces/finos/architectures/${id}/versions/1.0.0` });
        }
        const versionPath = /^\/api\/calm\/namespaces\/finos\/architectures\/(\d+)\/versions$/;
        const versionMatch = versionPath.exec(url.pathname);
        if (req.method === 'GET' && versionMatch) {
            const architecture = architectures.find((item) => item.id === versionMatch[1]);
            return architecture ? send(200, { values: architecture.versions }) : send(404, { error: 'missing' });
        }
        const createVersion = /^\/api\/calm\/namespaces\/finos\/architectures\/(\d+)\/versions\/(\d+\.\d+\.\d+)$/;
        const createMatch = createVersion.exec(url.pathname);
        if (req.method === 'POST' && createMatch) {
            const architecture = architectures.find((item) => item.id === createMatch[1]);
            if (!architecture) return send(404, { error: 'missing' });
            architecture.versions.push(createMatch[2]);
            return send(201);
        }
        return send(404, { error: 'unexpected route' });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const out = mkdtempSync(join(tmpdir(), 'zeta-seed-test-'));
    const envFile = join(out, 'hub-models.env');
    const log = () => {};

    try {
        const ids = await seedHub({ baseUrl: `http://127.0.0.1:${address.port}`, repoRoot: process.cwd(), envPath: envFile, log });
        assert.deepEqual(ids, { KYC: '1', ECH: '2', ARCHITECTURE: '3' });
        assert.equal(architectures.length, 3);
        assert.deepEqual(architectures.map((item) => item.versions), [['1.0.0'], ['1.0.0', '1.1.0'], ['1.0.0']]);
        const env = readFileSync(envFile, 'utf8');
        assert.match(env, /CALM_POC_KYC=1/);
        assert.match(env, /CALM_POC_ECH=2/);
        assert.match(env, /CALM_POC_ARCHITECTURE=3/);

        const firstArchitectureCreateCount = calls.filter((call) => call.method === 'POST' && call.path.endsWith('/architectures')).length;
        await seedHub({ baseUrl: `http://127.0.0.1:${address.port}`, repoRoot: process.cwd(), envPath: envFile, log });
        const secondArchitectureCreateCount = calls.filter((call) => call.method === 'POST' && call.path.endsWith('/architectures')).length;
        assert.equal(firstArchitectureCreateCount, 3);
        assert.equal(secondArchitectureCreateCount, firstArchitectureCreateCount);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        rmSync(out, { recursive: true, force: true });
    }
});
