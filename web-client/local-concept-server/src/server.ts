import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listEntries, getEntriesByIds, listEras } from './api/entries.js';
import { listLanesets, getLanesetsByIds } from './api/lanesets.js';
import { BadRequestError, QueryError } from './db.js';

const PORT = parseInt(process.env['PORT'] ?? '4242', 10);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

const MIME: Record<string, string> = {
  '.html':    'text/html; charset=utf-8',
  '.js':      'application/javascript; charset=utf-8',
  '.json':    'application/json',
  '.geojson': 'application/json',
  '.tsv':     'text/tab-separated-values; charset=utf-8',
  '.css':     'text/css; charset=utf-8',
  '.map':     'application/json',
  '.png':     'image/png',
  '.ico':     'image/x-icon',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) { resolve(undefined); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
  const method = req.method ?? 'GET';
  try {
    if (method === 'GET' && pathname === '/api/entries') {
      const url = new URL(req.url ?? '/', 'http://localhost');
      sendJson(res, 200, await listEntries(url.searchParams));
      return;
    }
    if (method === 'POST' && pathname === '/api/entries/by-ids') {
      const body = await readJsonBody(req) as { ids?: unknown };
      sendJson(res, 200, await getEntriesByIds(body?.ids ?? []));
      return;
    }
    if (method === 'GET' && pathname === '/api/eras') {
      sendJson(res, 200, await listEras());
      return;
    }
    if (method === 'GET' && pathname === '/api/lanesets') {
      sendJson(res, 200, await listLanesets());
      return;
    }
    if (method === 'POST' && pathname === '/api/lanesets/by-ids') {
      const body = await readJsonBody(req) as { ids?: unknown };
      sendJson(res, 200, await getLanesetsByIds(body?.ids ?? []));
      return;
    }
    sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    if (err instanceof BadRequestError) {
      sendJson(res, 400, { error: err.message });
    } else if (err instanceof QueryError) {
      console.error(err);
      sendJson(res, 502, { error: 'Database query failed' });
    } else {
      console.error(err);
      sendJson(res, 500, { error: 'Internal Server Error' });
    }
  }
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  // Resolve and guard against path traversal
  const resolved = path.resolve(PUBLIC_DIR, '.' + pathname);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Determine which file to serve
  const ext = path.extname(resolved);
  const filePath = ext ? resolved : path.join(PUBLIC_DIR, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const mime = MIME[path.extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
    if (method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
  });
}

function serve(req: http.IncomingMessage, res: http.ServerResponse): void {
  const rawUrl = req.url ?? '/';
  const pathname = new URL(rawUrl, 'http://localhost').pathname;

  if (pathname.startsWith('/api/')) {
    void handleApi(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
}

const server = http.createServer(serve);
server.listen(PORT, () => {
  console.log(`World Timelines → http://localhost:${PORT}`);
});
