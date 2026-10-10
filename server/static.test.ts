// Test that a malformed URL returns 400 instead of crashing the process.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveStatic } from './static.ts';

function fakeRes() {
  const chunks: Buffer[] = [];
  return {
    _chunks: chunks,
    _status: 0,
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) { (this as any)._status = status; if (headers) Object.assign(this._headers, headers); },
    end(body?: string | Buffer) { if (body) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(body)); },
    get body() { return Buffer.concat(chunks).toString('utf8'); },
  } as any;
}

test('malformed URL returns 400 and does not throw', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ip-test-'));
  const res = fakeRes();
  serveStatic(tmp, '/%E0%A4%A', res);
  assert.equal((res as any)._status, 400);
  assert.equal((res as any).body, 'Bad URL.');
});

test('valid URL with no dist serves index.html or 503', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ip-test-'));
  const res = fakeRes();
  serveStatic(tmp, '/some/path', res);
  assert.ok((res as any)._status === 200 || (res as any)._status === 503);
});

test('path traversal with sibling folder does not match', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ip-test-'));
  // Create a sibling directory like "tmp-evil"
  const sibling = tmp + '-evil';
  mkdirSync(sibling, { recursive: true });
  writeFileSync(join(sibling, 'secret.txt'), 'stolen');
  const res = fakeRes();
  // Try to traverse to the sibling folder
  serveStatic(tmp, '/../' + (tmp as string).split('/').pop() + '-evil/secret.txt', res);
  // Should NOT serve the stolen file — falls back to index.html or 503
  assert.ok((res as any)._status === 200 || (res as any)._status === 503);
  if ((res as any)._status === 200) {
    assert.notEqual((res as any).body, 'stolen', 'should not serve file from sibling directory');
  }
});
