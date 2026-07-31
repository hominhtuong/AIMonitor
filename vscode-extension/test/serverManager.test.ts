import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import {
  spawnAimonServer,
  probeVersion,
  waitForServer,
  getSpawnInfo,
  pythonCandidates,
  requestQuit,
  startAimonServer,
  explainSpawnFailure,
} from '../src/serverManager';

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
  // spawnAimonServer đã tự await sự kiện 'spawn'/'error' bên trong (waitForSpawnOutcome),
  // nên khi Promise trả về đã resolve thì sự kiện 'error' cho candidate cuối cùng đã bắn rồi
  // (once-listener không bắn lại lần hai) - test chỉ cần đọc SpawnInfo, không chờ sự kiện nữa.
  const proc = await spawnAimonServer('.', ['this-binary-does-not-exist-xyz']);
  const info = getSpawnInfo(proc);
  assert.ok(info);
  assert.equal(info?.enoent, true);
});

test('spawnAimonServer falls back to next candidate on ENOENT', async () => {
  const proc = await spawnAimonServer('.', ['this-binary-does-not-exist-xyz', 'this-one-either']);
  const info = getSpawnInfo(proc);
  assert.ok(info);
  assert.equal(info?.pythonBin, 'this-one-either');
  assert.equal(info?.enoent, true);
});

test('waitForServer includes ENOENT hint in timeout message when proc spawn info is available', async () => {
  const proc = await spawnAimonServer('.', ['this-binary-does-not-exist-xyz']);
  await assert.rejects(
    () => waitForServer(10, 50, () => null, proc),
    /is not on PATH/
  );
});

test('pythonCandidates puts the py launcher first on Windows', () => {
  // `python` trên Windows hay là alias Microsoft Store (chạy được, thoát ngay, không lên
  // server). `py -3` không bao giờ trỏ về alias đó nên phải đứng trước.
  assert.deepEqual(pythonCandidates('win32'), ['py -3', 'python', 'python3']);
  assert.deepEqual(pythonCandidates('darwin'), ['python3', 'python']);
  assert.deepEqual(pythonCandidates('linux'), ['python3', 'python']);
});

test('a candidate with arguments spawns the binary with those arguments', async () => {
  const proc = await spawnAimonServer('.', ['definitely-not-a-real-bin -3']);
  const info = getSpawnInfo(proc);
  assert.equal(info?.pythonBin, 'definitely-not-a-real-bin -3');
  assert.equal(info?.enoent, true);
});

test('requestQuit posts to /api/quit', async () => {
  let seen = '';
  const server = http.createServer((req, res) => {
    seen = `${req.method} ${req.url}`;
    res.writeHead(200);
    res.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  assert.equal(await requestQuit('127.0.0.1', port), true);
  assert.equal(seen, 'POST /api/quit');

  server.close();
});

test('requestQuit resolves false when nothing listens', async () => {
  assert.equal(await requestQuit('127.0.0.1', 1, 200), false);
});

test('waitForServer gives up as soon as the process exits instead of waiting out the timeout', async () => {
  // node bỏ qua cờ -m nên tiến trình chết ngay. Không có nhánh thoát sớm thì test này sẽ
  // treo đủ 10 giây.
  const proc = await spawnAimonServer('.', [process.execPath]);
  const started = Date.now();
  await assert.rejects(() => waitForServer(50, 10000, () => null, proc));
  assert.ok(Date.now() - started < 5000, 'phải thoát sớm, không chờ hết timeout');
});

test('an immediate silent exit is reported as the Microsoft Store placeholder', () => {
  // Đúng dấu hiệu của alias Store: spawn được (không ENOENT), không in gì ra stderr, thoát
  // ngay với 9009. Dựng thẳng SpawnInfo vì hành vi này chỉ có trên Windows.
  const message = explainSpawnFailure({
    pythonBin: 'python',
    stderr: '',
    enoent: false,
    exited: true,
    exitCode: 9009,
  });
  assert.match(message, /Microsoft Store placeholder/);
  assert.match(message, /Add python\.exe to PATH/);
});

test('stderr from the interpreter is surfaced instead of the Store hint', () => {
  const message = explainSpawnFailure({
    pythonBin: 'python3',
    stderr: 'ModuleNotFoundError: No module named aimon',
    enoent: false,
    exited: true,
    exitCode: 1,
  });
  assert.match(message, /No module named aimon/);
  assert.doesNotMatch(message, /Microsoft Store/);
});

test('startAimonServer reports every candidate it tried', async () => {
  const err = await startAimonServer('.', ['no-such-bin-a', 'no-such-bin-b'], 200).catch((e) => e);
  assert.ok(err instanceof Error);
  assert.match(err.message, /no-such-bin-a/);
  assert.match(err.message, /no-such-bin-b/);
  assert.match(err.message, /python\.org/);
});
