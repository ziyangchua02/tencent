// Production server: the API plus the built web app from dist/, on one port.
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApi } from './api.ts';
import { ensureSeedPdfs, openStore } from './store.ts';
import { serveStatic } from './static.ts';

try { process.loadEnvFile(); } catch { /* no .env file: use the real environment */ }

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const DIST = join(import.meta.dirname, '..', 'dist');

const store = openStore(process.env.DB_PATH ?? 'data/pills.db');
await ensureSeedPdfs(store);
const api = createApi(store);

createServer((req, res) => {
  api(req, res, () => serveStatic(DIST, new URL(req.url ?? '/', 'http://local').pathname, res))
    .catch((e) => { console.error(e); if (!res.headersSent) { res.writeHead(400, { 'content-type': 'text/plain' }); res.end('Bad request.'); } });
}).listen(PORT, HOST, () => console.log(`Intelligence Pills on http://${HOST}:${PORT}`));
