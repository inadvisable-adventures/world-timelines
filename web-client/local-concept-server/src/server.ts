import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function serve(req: http.IncomingMessage, res: http.ServerResponse): void {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const rawUrl = req.url ?? '/';
  const pathname = new URL(rawUrl, 'http://localhost').pathname;

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

const server = http.createServer(serve);
server.listen(PORT, () => {
  console.log(`World Timelines → http://localhost:${PORT}`);
});
