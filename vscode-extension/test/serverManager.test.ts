import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { spawnAimonServer, probeVersion, waitForServer } from '../src/serverManager';

test('probeVersion resolves true when server responds 200', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = (address as { port: number }).port;

  const alive = await probeVersion('127.0.0.1', port);
  assert.equal(alive, true);

  server.close();
});

test('probeVersion resolves false when nothing listens', async () => {
  const alive = await probeVersion('127.0.0.1', 1, 200);
  assert.equal(alive, false);
});

test('waitForServer resolves once readFn returns a probeable instance', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = (address as { port: number }).port;

  let calls = 0;
  const readFn = () => {
    calls += 1;
    if (calls < 3) return null;
    return { host: '127.0.0.1', port, pid: 999 };
  };

  const instance = await waitForServer(10, 2000, readFn);
  assert.equal(instance.port, port);
  assert.ok(calls >= 3);

  server.close();
});

test('waitForServer throws after timeout when readFn never returns a valid instance', async () => {
  await assert.rejects(() => waitForServer(10, 100, () => null));
});

test('spawnAimonServer does not crash when the binary does not exist', async () => {
  const proc = spawnAimonServer('.', 'this-binary-does-not-exist-xyz');
  await new Promise((resolve) => {
    proc.once('error', resolve);
    proc.once('exit', resolve);
  });
  assert.ok(true);
});
