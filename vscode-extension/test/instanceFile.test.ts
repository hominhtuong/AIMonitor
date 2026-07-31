import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readInstanceFile } from '../src/instanceFile';

function tmpFile(content: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimon-test-'));
  const file = path.join(dir, 'instance.json');
  if (content !== null) {
    fs.writeFileSync(file, content);
  }
  return file;
}

test('readInstanceFile parses valid instance', () => {
  const file = tmpFile(JSON.stringify({ host: '127.0.0.1', port: 8899, pid: 4242 }));
  const result = readInstanceFile(file);
  assert.deepEqual(result, { host: '127.0.0.1', port: 8899, pid: 4242 });
});

test('readInstanceFile returns null when file missing', () => {
  const file = path.join(os.tmpdir(), 'aimon-does-not-exist', 'instance.json');
  assert.equal(readInstanceFile(file), null);
});

test('readInstanceFile returns null on malformed JSON', () => {
  const file = tmpFile('{not json');
  assert.equal(readInstanceFile(file), null);
});

test('readInstanceFile returns null when fields missing', () => {
  const file = tmpFile(JSON.stringify({ host: '127.0.0.1' }));
  assert.equal(readInstanceFile(file), null);
});
