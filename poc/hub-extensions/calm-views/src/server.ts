import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheGraphExport, getGraphExport } from './export.js';
import { composeMultiViewDocument, loadViews, matchViews, parseOptions, parseView, viewsLensReply, type LensReply } from './lens.js';
import { listViewFiles } from '../../../tools/dist/calm.js';
import { hasArchitectureShape, Problem } from './problem.js';
import { pocScreen, type PocScreenConfig } from './poc.js';

/** The manifest id. Hub names the extension folder after it. */
export const EXTENSION_ID = 'calm-views';
/** The files that Hub reads from the extension folder. */
export const EXTENSION_FILES = ['extension.json', 'notation.json'];
/** Larger than the default max-request-bytes of Hub (1 MiB), so an operator can raise that a little. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface ViewsServiceConfig {
    /** Where the *.calm-view.json sidecars live. Empty string disables the view lookup. */
    viewsDir: string;
    /** Browser-reachable base URL for image download links. */
    exportBaseUrl?: string;
    /** The in-Hub presentation card and screen. */
    poc?: PocScreenConfig;
}

const LENS_PATH = /^\/lens\/([^/]+)\/([^/]+)\/([^/]+)$/;
const EXTENSION_FILE_PATH = /^\/extension\/([a-z.]+)$/;
const EXPORT_PATH = /^\/export\/([^/]+)\/([a-f0-9-]{36})$/i;

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'private, no-store' });
    res.end(JSON.stringify(body));
}

function sendProblem(res: ServerResponse, problem: Problem) {
    send(res, problem.status, { type: 'about:blank', title: problem.title, status: problem.status, ...(problem.detail && { detail: problem.detail }) },
        'application/problem+json');
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY_BYTES) throw new Problem(413, 'The request is too large for the views service');
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

function decodePathSegment(segment: string) {
    try {
        return decodeURIComponent(segment);
    } catch {
        throw new Problem(400, 'The path has an escape that is not valid');
    }
}

/** The folder of the service, which holds extension.json and notation.json, next to dist/. */
export const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

export function createViewsHandler(config: ViewsServiceConfig, packageDir = PACKAGE_DIR) {
    async function lens(url: URL, [namespace, resourceType, resourceId]: string[], body: Buffer): Promise<LensReply> {
        if (resourceType !== 'architectures') throw new Problem(404, 'The views lens shows architectures only');
        let document: Record<string, unknown> | undefined;
        try {
            document = (JSON.parse(body.toString('utf8')) as { document?: Record<string, unknown> } | null)?.document;
        } catch {
            throw new Problem(400, 'The body from CALM Hub is not JSON');
        }
        if (!document || typeof document !== 'object') {
            throw new Problem(400, 'CALM Hub sent no architecture', 'The lens route of the manifest needs "hubData": ["document"]');
        }
        if (!hasArchitectureShape(document)) {
            throw new Problem(400, 'The architecture is not valid CALM', 'Each node needs a unique-id and a node-type, and each relationship a unique-id and a relationship-type');
        }
        const docId = typeof document['$id'] === 'string' ? (document['$id'] as string) : resourceId;
        const views = loadViews(config.viewsDir);
        const viewId = parseView(url.searchParams.get('view'));
        const matchingViews = matchViews(views, docId, typeof document['unique-id'] === 'string' ? document['unique-id'] : '');
        const selectedView = matchingViews.find((view) => view.uniqueId === viewId) ?? matchingViews[0];
        const lensDocument = selectedView && Array.isArray(selectedView.for) && selectedView.for.length > 1
            ? composeMultiViewDocument(document, docId, selectedView, config.viewsDir)
            : document;
        const reply = viewsLensReply(
            lensDocument,
            views,
            viewId,
            docId,
            parseOptions(url)
        );
        const token = await cacheGraphExport(reply.title, reply.graph, namespace, reply.layout);
        const exportBase = (config.exportBaseUrl ?? 'http://localhost:8095').replace(/\/+$/, '');
        reply.panels.push({
            title: 'Export view',
            blocks: [
                {
                    type: 'links',
                    items: [
                        { label: 'Download SVG', href: `${exportBase}/export/${encodeURIComponent(namespace)}/${token}?format=svg` },
                        { label: 'Download PNG', href: `${exportBase}/export/${encodeURIComponent(namespace)}/${token}?format=png` },
                    ],
                },
            ],
        });
        return reply;
    }

    async function handle(req: IncomingMessage, res: ServerResponse) {
        let url: URL;
        try {
            url = new URL(req.url ?? '/', 'http://backend');
        } catch {
            return sendProblem(res, new Problem(400, 'The request target is not valid'));
        }
        if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { status: 'ok' });
        if (req.method === 'GET' && url.pathname === '/poc') return send(res, 200, pocScreen(config.viewsDir, config.poc));
        if (req.method === 'GET' && url.pathname === '/views') {
            try {
                return send(res, 200, { views: listViewFiles(config.viewsDir) });
            } catch {
                return sendProblem(res, new Problem(500, 'Cannot list the views directory'));
            }
        }
        const exportMatch = req.method === 'GET' ? url.pathname.match(EXPORT_PATH) : null;
        if (exportMatch) {
            const exported = await getGraphExport(exportMatch[2] as string, url.searchParams.get('format') ?? '', decodePathSegment(exportMatch[1] as string));
            if (!exported) return sendProblem(res, new Problem(404, 'The export is not available', 'It may have expired. Reopen the view and try again.'));
            res.writeHead(200, {
                'Content-Type': exported.contentType,
                'Content-Disposition': `attachment; filename="${exported.fileName}"`,
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
            });
            return res.end(exported.body);
        }
        const file = req.method === 'GET' ? url.pathname.match(EXTENSION_FILE_PATH)?.[1] : undefined;
        if (file && EXTENSION_FILES.includes(file)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' });
            return res.end(await readFile(join(packageDir, file)));
        }
        let body: Buffer;
        try {
            body = await readBody(req);
        } catch (error) {
            if (error instanceof Problem) return sendProblem(res, error);
            return sendProblem(res, new Problem(500, 'The service failed'));
        }
        const match = req.method === 'POST' ? url.pathname.match(LENS_PATH) : null;
        try {
            if (!match) throw new Problem(404, 'Not found');
            const reply = await lens(url, match.slice(1).map(decodePathSegment), body);
            console.log(`POST ${url.pathname}${url.search} for an open caller: ${reply.graph.nodes.length} nodes`);
            return send(res, 200, reply);
        } catch (error) {
            const problem = error instanceof Problem ? error : new Problem(502, 'The views service failed', (error as Error).message);
            console.warn(`${req.method} ${url.pathname}${url.search}: ${problem.status} ${problem.message}`);
            return sendProblem(res, problem);
        }
    }

    return (req: IncomingMessage, res: ServerResponse) => {
        handle(req, res).catch((error: unknown) => {
            console.error(`${req.method} ${req.url}: ${(error as Error).message}`);
            if (!res.headersSent) sendProblem(res, new Problem(500, 'The service failed'));
            else res.destroy();
        });
    };
}

export function createViewsServer(config: ViewsServiceConfig) {
    return createServer(createViewsHandler(config));
}

/**
 * Copies the extension folder into `<dir>/calm-views`, for a Hub that reads `calm.extensions.dir` from a shared volume.
 * The copy runs at each start, so a new image replaces the files of the last one.
 */
export async function exportExtension(dir: string, from = PACKAGE_DIR) {
    const target = join(dir, EXTENSION_ID);
    await mkdir(target, { recursive: true });
    await Promise.all(EXTENSION_FILES.map((file) => copyFile(join(from, file), join(target, file))));
    return target;
}
