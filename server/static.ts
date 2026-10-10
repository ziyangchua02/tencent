// Static file serving: shared between main.ts and tests.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

/** Serve a static file from dist/, or fall back to index.html for SPA routes. */
export function serveStatic(dist: string, path: string, res: import('node:http').ServerResponse) {
  let decoded: string;
  try { decoded = decodeURIComponent(path); }
  catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('Bad URL.'); }
  const file = normalize(join(dist, decoded));
  // Prefix must include the separator so sibling folders like "dist-evil" don't match.
  const isAsset = file.startsWith(dist + sep) && existsSync(file) && statSync(file).isFile();
  const target = isAsset ? file : join(dist, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('Web app not built. Run `npm run build` first.');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
    // Hashed assets never change; index.html must be re-read so a redeploy shows at once.
    'cache-control': target.includes(join('dist', 'assets')) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
}
