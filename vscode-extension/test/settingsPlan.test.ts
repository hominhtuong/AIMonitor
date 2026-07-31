import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { planSettings, nextFilled, SettingKey } from '../src/settingsPlan';

type Str = Record<SettingKey, string>;
type Bool = Record<SettingKey, boolean>;

const EMPTY: Str = { pythonPath: '', claudeDataDir: '', pricingFile: '' };
const DETECTED: Str = {
  pythonPath: '/usr/bin/python3',
  claudeDataDir: '/home/me/.claude',
  pricingFile: '/ext/1.4.0/pricing.json',
};
const ALL_OK: Bool = { pythonPath: true, claudeDataDir: true, pricingFile: true };

test('ô trống chưa từng điền thì được điền vào', () => {
  const plan = planSettings({ current: EMPTY, detected: DETECTED, valid: ALL_OK, filled: {} });
  assert.deepEqual(
    plan.writes.map((w) => [w.key, w.value, w.reason]),
    [
      ['pythonPath', '/usr/bin/python3', 'fill'],
      ['claudeDataDir', '/home/me/.claude', 'fill'],
      ['pricingFile', '/ext/1.4.0/pricing.json', 'fill'],
    ]
  );
  assert.deepEqual(plan.warn, []);
});

test('ô người dùng tự xoá thì KHÔNG điền lại', () => {
  // Đây là điểm quan trọng nhất của file này: xoá đi là ý muốn quay về chế độ tự dò. Điền
  // lại thì mỗi lần mở VSCode giá trị lại mọc ra, người dùng xoá mãi không được.
  const plan = planSettings({
    current: EMPTY,
    detected: DETECTED,
    valid: ALL_OK,
    filled: { pythonPath: '/usr/bin/python3' },
  });
  assert.deepEqual(plan.writes.map((w) => w.key), ['claudeDataDir', 'pricingFile']);
});

test('không dò ra gì thì không ghi gì', () => {
  const plan = planSettings({ current: EMPTY, detected: EMPTY, valid: ALL_OK, filled: {} });
  assert.deepEqual(plan.writes, []);
});

test('giá trị còn dùng được thì để yên', () => {
  const current: Str = { ...DETECTED, pythonPath: '/opt/python3.12' };
  const plan = planSettings({ current, detected: DETECTED, valid: ALL_OK, filled: {} });
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.warn, []);
});

test('đường dẫn mình từng điền mà nay chết thì tự thay bằng bản mới', () => {
  // Ca thật: extension cập nhật, thư mục cài đổi tên nên pricing.json cũ biến mất.
  const current: Str = { ...EMPTY, pricingFile: '/ext/1.3.0/pricing.json' };
  const plan = planSettings({
    current,
    detected: DETECTED,
    valid: { ...ALL_OK, pricingFile: false },
    filled: { pricingFile: '/ext/1.3.0/pricing.json' },
  });
  const heal = plan.writes.find((w) => w.key === 'pricingFile');
  assert.deepEqual(heal, { key: 'pricingFile', value: '/ext/1.4.0/pricing.json', reason: 'heal' });
  assert.deepEqual(plan.warn, []);
});

test('đường dẫn NGƯỜI DÙNG tự gõ mà chết thì chỉ cảnh báo, không sửa', () => {
  const current: Str = { ...EMPTY, pythonPath: '/tôi/tự/gõ/python' };
  const plan = planSettings({
    current,
    detected: DETECTED,
    valid: { ...ALL_OK, pythonPath: false },
    filled: {},
  });
  assert.deepEqual(plan.writes.map((w) => w.key), ['claudeDataDir', 'pricingFile']);
  assert.deepEqual(plan.warn, ['pythonPath']);
});

test('mình điền mà chết, lại không dò ra bản thay thế => trả ô về trống để tự dò', () => {
  const current: Str = { ...EMPTY, pythonPath: '/da/go/python' };
  const plan = planSettings({
    current,
    detected: EMPTY,
    valid: { ...ALL_OK, pythonPath: false },
    filled: { pythonPath: '/da/go/python' },
  });
  assert.deepEqual(plan.writes, [{ key: 'pythonPath', value: '', reason: 'heal' }]);
});

test('nextFilled quên đi ô bị trả về trống', () => {
  const after = nextFilled(
    { pythonPath: '/cu', claudeDataDir: '/home/me/.claude' },
    [
      { key: 'pythonPath', value: '', reason: 'heal' },
      { key: 'pricingFile', value: '/moi.json', reason: 'fill' },
    ]
  );
  // pythonPath biến mất hẳn: lần sau coi như chưa từng điền nên sẽ được dò lại.
  assert.deepEqual(after, { claudeDataDir: '/home/me/.claude', pricingFile: '/moi.json' });
});
