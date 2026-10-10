import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createOpencodeTransport, transportErrorDetails } from '../src/opencode-transport.js';
import { timeoutSignal } from '../src/timeout.js';
import { runProcess } from '../src/process.js';

test('local transport waits for delayed headers and body; closes owned connections', async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/body') { response.writeHead(200); response.write('begin:'); }
    await delay(200);
    response.end('complete');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const transport = createOpencodeTransport(), url = 'http://127.0.0.1:' + (server.address() as any).port;
  try {
    const results = await Promise.all(['/headers', '/body'].map(async route => {
      const response = await transport.fetch(new Request(url + route, { signal: timeoutSignal(0) }));
      return response.text();
    }));
    assert.deepEqual(results, ['complete', 'begin:complete']);
  } finally { await transport.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('unlimited transport still honors stop while waiting for headers or body', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/body') { response.writeHead(200); response.write('begin'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const transport = createOpencodeTransport(), url = 'http://127.0.0.1:' + (server.address() as any).port;
  try {
    for (const route of ['/headers', '/body']) {
      const signal = AbortSignal.timeout(150);
      await assert.rejects(async () => { const response = await transport.fetch(url + route, { signal }); await response.text(); }, /abort|timeout/i);
    }
  } finally { await transport.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('unlimited process completes and still terminates on explicit cancellation', async () => {
  const done = await runProcess(process.execPath, ['-e', "setTimeout(()=>console.log('complete'),150)"], { cwd: process.cwd(), timeoutMs: 0 });
  assert.equal(done.exitCode, 0); assert.match(done.stdout, /complete/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: process.cwd(), timeoutMs: 0, signal: AbortSignal.timeout(200) }), /Stopped/);
});

test('transport errors retain safe cause category without leaking requests', () => {
  const error = Object.assign(new Error('fetch failed'), { cause: { name: 'HeadersTimeoutError', code: 'UND_ERR_HEADERS_TIMEOUT', request: { Authorization: 'secret' } } });
  assert.deepEqual(transportErrorDetails(error), { causeName: 'HeadersTimeoutError', causeCode: 'UND_ERR_HEADERS_TIMEOUT' });
  assert.deepEqual(transportErrorDetails(null), {});
});
