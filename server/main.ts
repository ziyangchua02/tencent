// Production server: the API plus the built web app from dist/, on one port.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createApi } from './api.ts';
import { ensureSeedPdfs, openStore } from './store.ts';

try { process.loadEnvFile(); } catch { /* no .env file: use the real environment */ }

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const DIST = join(import.meta.dirname, '..', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

const store = openStore(process.env.DB_PATH ?? 'data/pills.db');
await ensureSeedPdfs(store);
const api = createApi(store);

function serveStatic(path: string, res: import('node:http').ServerResponse) {
  const file = normalize(join(DIST, decodeURIComponent(path)));
  const isAsset = file.startsWith(DIST) && existsSync(file) && statSync(file).isFile();
  const target = isAsset ? file : join(DIST, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('Web app not built. Run `npm run build` first.');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
    // Hashed assets never change; index.html must be re-read so a redeploy shows at once.
    'cache-control': target.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
}

createServer((req, res) => {
  api(req, res, () => serveStatic(new URL(req.url ?? '/', 'http://local').pathname, res));
}).listen(PORT, HOST, () => console.log(`Intelligence Pills on http://${HOST}:${PORT}`));
