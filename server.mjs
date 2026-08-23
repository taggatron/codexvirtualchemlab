import http from 'node:http';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const port = Number(process.argv[2] || process.env.PORT) || 4173;
const root = resolve(process.cwd());
const cache = new Map();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};
const compressible = /^(text\/|application\/(javascript|json|svg\+xml))/;

async function cachedAsset(filePath) {
  const metadata = await stat(filePath);
  const previous = cache.get(filePath);
  if (previous?.mtimeMs === metadata.mtimeMs && previous.size === metadata.size) return previous;
  const body = await readFile(filePath);
  const type = types[extname(filePath).toLowerCase()] || 'application/octet-stream';
  const asset = {
    body,
    type,
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    etag: `"${createHash('sha256').update(body).digest('base64url').slice(0, 22)}"`
  };
  if (body.length >= 1024 && compressible.test(type)) {
    [asset.br, asset.gzip] = await Promise.all([
      compressBrotli(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }),
      compressGzip(body, { level: 6 })
    ]);
  }
  cache.set(filePath, asset);
  return asset;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) throw new Error('Path outside static root');

    const asset = await cachedAsset(filePath);
    const immutable = url.searchParams.has('v') || /(?:^|\/)(?:vendor\/|[^/]+\.(?:woff2?|webp))/.test(relativePath);
    const cacheControl = relativePath === 'index.html'
      ? 'no-cache'
      : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600, must-revalidate';
    const headers = {
      'Content-Type': asset.type,
      'Cache-Control': cacheControl,
      'ETag': asset.etag,
      'Vary': 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff'
    };
    if (req.headers['if-none-match'] === asset.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    const accepted = req.headers['accept-encoding'] || '';
    let body = asset.body;
    if (asset.br && /\bbr\b/.test(accepted)) { body = asset.br; headers['Content-Encoding'] = 'br' }
    else if (asset.gzip && /\bgzip\b/.test(accepted)) { body = asset.gzip; headers['Content-Encoding'] = 'gzip' }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-cache', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

let currentPort = port;
server.on('error', error => {
  if (error.code === 'EADDRINUSE') server.listen(++currentPort);
  else console.error(error);
});
server.on('listening', () => console.log(`Practical Lab: http://localhost:${currentPort}`));
server.listen(currentPort);
