import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  parsePyLauncherPaths,
  parseWhichOutput,
  isStoreAliasStub,
  orderedCandidates,
  parseVersionProbe,
  meetsMinimum,
  verifyCandidate,
  wellKnownPaths,
} from '../src/pythonFinder';

test('parsePyLauncherPaths reads the paths out of `py -0p`', () => {
  const out = parsePyLauncherPaths(
    [
      ' -V:3.13 *        C:\\Users\\Uyen Tran\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
      ' -V:3.11          C:\\Python311\\python.exe',
      'Some header line without a path',
    ].join('\r\n')
  );
  // Đường dẫn có khoảng trắng trong tên user vẫn phải lấy đủ.
  assert.deepEqual(out, [
    'C:\\Users\\Uyen Tran\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
    'C:\\Python311\\python.exe',
  ]);
});

test('parseWhichOutput drops blank lines', () => {
  assert.deepEqual(parseWhichOutput('/usr/bin/python3\n\n/opt/homebrew/bin/python3\n'), [
    '/usr/bin/python3',
    '/opt/homebrew/bin/python3',
  ]);
});

test('a zero-byte WindowsApps entry is the Store alias, a real one is not', () => {
  const stub = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe';
  assert.equal(isStoreAliasStub(stub, () => 0), true);
  // Bản Python cài thật từ Store cũng nằm trong WindowsApps nhưng có kích thước thật.
  assert.equal(isStoreAliasStub(stub, () => 98304), false);
  assert.equal(isStoreAliasStub('C:\\Python313\\python.exe', () => 0), false);
});

test('Windows tries the py launcher first, macOS tries PATH before /usr/bin', () => {
  const win = orderedCandidates('win32', ['C:\\Python313\\python.exe'], [], []);
  assert.deepEqual(win[0], { command: 'py', args: ['-3'], source: 'py launcher' });
  assert.equal(win[1].command, 'C:\\Python313\\python.exe');

  const mac = orderedCandidates('darwin', [], [], ['/usr/bin/python3']);
  const names = mac.map((c) => c.command);
  assert.ok(names.indexOf('python3') < names.indexOf('/usr/bin/python3'));
});

test('candidates are de-duplicated', () => {
  const c = orderedCandidates('darwin', [], ['/usr/bin/python3'], ['/usr/bin/python3']);
  assert.equal(c.filter((x) => x.command === '/usr/bin/python3').length, 1);
});

test('wellKnownPaths looks in the right places per platform', () => {
  const win = wellKnownPaths('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me');
  // Không khẳng định có file thật, chỉ cần không nổ và trả về mảng.
  assert.ok(Array.isArray(win));

  const mac = wellKnownPaths('darwin', {}, '/Users/me');
  assert.ok(mac.includes('/opt/homebrew/bin/python3'));
  assert.ok(mac.includes('/usr/bin/python3'));
  assert.ok(mac.includes('/Users/me/.pyenv/shims/python3'));
});

test('parseVersionProbe and the 3.9 floor', () => {
  assert.deepEqual(parseVersionProbe('AIMONPY 3 13\n'), [3, 13]);
  assert.equal(parseVersionProbe('rác không liên quan'), null);
  assert.equal(meetsMinimum([3, 9]), true);
  assert.equal(meetsMinimum([3, 13]), true);
  assert.equal(meetsMinimum([4, 0]), true);
  assert.equal(meetsMinimum([3, 8]), false);
  assert.equal(meetsMinimum([2, 7]), false);
});

test('verifyCandidate rejects a binary that is not Python', async () => {
  const bad = await verifyCandidate({ command: process.execPath, args: [], source: 'test' });
  assert.equal(bad, null);
});

test('verifyCandidate accepts a real Python and reports its version', async (t) => {
  const py = await verifyCandidate({ command: 'python3', args: [], source: 'test' });
  if (!py) return t.skip('máy chạy test không có python3 trên PATH');
  assert.equal(py.version[0], 3);
  assert.ok(meetsMinimum(py.version));
});
