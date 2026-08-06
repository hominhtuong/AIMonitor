import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  summarize,
  statusText,
  severityOf,
  formatDuration,
  pctText,
  dashboardUrl,
  fmtTokens,
} from '../src/usage';

/** Rút gọn từ payload thật của /api/snapshot. */
const SNAPSHOT = {
  usage: {
    five_hour: { pct: 44.1, source: 'estimate', resets_in: 5827 },
    seven_day: { pct: 54.3, source: 'estimate', resets_in: 269834 },
  },
  totals: { today: { cost: 76.0393, total: 128000 } },
};

test('summarize reads the numbers the status bar needs', () => {
  const u = summarize(SNAPSHOT);
  assert.equal(u.sessionPct, 44.1);
  assert.equal(u.weeklyPct, 54.3);
  assert.equal(u.todayCost, 76.0393);
  assert.equal(u.todayTokens, 128000);
  assert.equal(u.estimated, true);
  assert.equal(u.resetsInSec, 5827);
});

test('summarize survives a snapshot with nothing in it', () => {
  for (const bad of [null, undefined, {}, { usage: {} }, { usage: { five_hour: {} } }]) {
    const u = summarize(bad);
    assert.equal(u.sessionPct, null);
    assert.equal(u.todayCost, null);
    assert.equal(u.todayTokens, null);
  }
});

test('an official number is not marked as an estimate', () => {
  const u = summarize({ usage: { five_hour: { pct: 37, source: 'official' } } });
  assert.equal(u.estimated, false);
  assert.equal(statusText(u, 'session'), '$(pulse) 37%');
});

test('statusText per metric', () => {
  const u = summarize(SNAPSHOT);
  assert.equal(statusText(u, 'both'), '$(pulse) ~44% · ~54%');
  assert.equal(statusText(u, 'session'), '$(pulse) ~44%');
  assert.equal(statusText(u, 'weekly'), '$(pulse) ~54% tuần');
  assert.equal(statusText(u, 'cost'), '$(pulse) $76.04');
  // Chưa có server nào chạy thì chỉ là cái nhãn, không có số bịa ra.
  assert.equal(statusText(null, 'both'), '$(pulse) AI Monitor');
});

test('pctText shows -- rather than 0% when there is no number', () => {
  assert.equal(pctText(null), '--');
  assert.equal(pctText(0), '0%');
  assert.equal(pctText(44.6), '45%');
});

test('severity thresholds', () => {
  const at = (session: number, weekly: number) =>
    severityOf({ sessionPct: session, weeklyPct: weekly, todayCost: 0, todayTokens: null, estimated: true, resetsInSec: null });
  assert.equal(at(10, 10), 'ok');
  assert.equal(at(69.9, 0), 'ok');
  assert.equal(at(70, 0), 'warn');
  assert.equal(at(0, 89.9), 'warn');
  // Lấy con số xấu nhất trong hai cửa sổ, không lấy trung bình.
  assert.equal(at(5, 95), 'danger');
  assert.equal(severityOf(null), 'ok');
});

test('formatDuration', () => {
  assert.equal(formatDuration(5827), '1h37');
  assert.equal(formatDuration(600), '10m');
  assert.equal(formatDuration(0), '');
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(-5), '');
});

test('dashboardUrl carries the settings the page reads', () => {
  const u = dashboardUrl('http://127.0.0.1:8899/', {
    theme: 'light',
    refreshSeconds: 5,
    compact: true,
  });
  const parsed = new URL(u);
  assert.equal(parsed.searchParams.get('theme'), 'light');
  assert.equal(parsed.searchParams.get('refresh'), '5');
  assert.equal(parsed.searchParams.get('compact'), '1');
});

test('dashboardUrl gửi kèm bộ lọc loại agent', () => {
  const u = dashboardUrl('http://127.0.0.1:8899/', {
    theme: 'dark',
    refreshSeconds: 3,
    compact: false,
    aiKinds: ['claude-code', 'codex'],
  });
  assert.equal(new URL(u).searchParams.get('kinds'), 'claude-code,codex');
});

test('không có loại nào thì KHÔNG gửi kinds', () => {
  // Gửi `kinds=` rỗng là ra lệnh cho server "ẩn hết". Ở đây ý là "không ép gì cả", nên
  // tham số phải vắng mặt hẳn để trang tự lấy lựa chọn đã lưu.
  const u = dashboardUrl('http://127.0.0.1:8899/', {
    theme: 'dark',
    refreshSeconds: 3,
    compact: false,
    aiKinds: [],
  });
  assert.equal(new URL(u).searchParams.has('kinds'), false);
});

test('the tab view asks for no compact flag at all', () => {
  const u = dashboardUrl('http://127.0.0.1:8899/', {
    theme: 'dark',
    refreshSeconds: 3,
    compact: false,
  });
  assert.equal(new URL(u).searchParams.has('compact'), false);
});

test('dashboardUrl keeps a forwarded host and port intact', () => {
  // Qua Remote-SSH, asExternalUri trả về một tên miền khác hẳn - không được làm hỏng nó.
  const u = dashboardUrl('https://abc-8899.euw.devtunnels.ms/', {
    theme: 'dark',
    refreshSeconds: 3,
    compact: false,
  });
  assert.ok(u.startsWith('https://abc-8899.euw.devtunnels.ms/?'));
});

test('fmtTokens rút gọn K/M', () => {
  assert.equal(fmtTokens(null), '--');
  assert.equal(fmtTokens(0), '0');
  assert.equal(fmtTokens(420), '420');
  assert.equal(fmtTokens(999), '999');
  assert.equal(fmtTokens(128000), '128K');
  assert.equal(fmtTokens(999500), '999.5K');
  assert.equal(fmtTokens(1000), '1K');
  assert.equal(fmtTokens(1250000), '1.2M');
  assert.equal(fmtTokens(2000000), '2M');
});
