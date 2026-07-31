// Chạy toàn bộ test trong test/ bằng node --test.
//
// Không dùng `node --test test/*.test.ts` trong package.json: dấu sao ở đó do SHELL bung ra,
// mà npm trên Windows chạy script bằng cmd.exe - cmd không bung glob nên node nhận nguyên
// chuỗi "test/*.test.ts" rồi báo không tìm thấy file. Node 20 cũng không tự tìm được file
// .ts (bộ lọc mặc định của nó chỉ nhận .js/.cjs/.mjs), nên phải tự liệt kê.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const testDir = path.join(__dirname, '..', 'test');
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => path.join('test', f));

if (files.length === 0) {
  console.error('Không tìm thấy file test nào trong test/');
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ['--require', 'ts-node/register', '--test', ...files],
  { cwd: path.join(__dirname, '..'), stdio: 'inherit' }
);
child.on('exit', (code) => process.exit(code === null ? 1 : code));
