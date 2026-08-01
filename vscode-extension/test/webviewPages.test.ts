import { test } from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { dashboardFramePage } from '../src/webviewPages';

/**
 * Cầu nối tin nhắn của trang bọc dashboard, chạy thật chứ không đọc chuỗi.
 *
 * Kịch bản này chỉ hỏng khi extension đã cài lên máy người dùng: trang bọc là HTML sinh ra
 * lúc chạy, TypeScript không kiểm được gì bên trong nó. Nên lấy đúng đoạn `<script>` của
 * `dashboardFramePage` đem chạy trong `vm` với một cái webview giả.
 */
function runBridge() {
  const html = dashboardFramePage('http://127.0.0.1:8899/', true);
  const script = html.substring(html.indexOf('<script>') + 8, html.indexOf('</script>'));

  const toIframe: unknown[] = [];
  const toExtension: unknown[] = [];
  const listeners: Record<string, ((e?: { data: unknown }) => void)[]> = {};
  const on = (type: string, fn: (e?: { data: unknown }) => void) => {
    (listeners[type] ??= []).push(fn);
  };

  const iframe = {
    contentWindow: { postMessage: (m: unknown) => toIframe.push(m) },
    addEventListener: on,
  };

  const ctx = {
    document: { getElementById: () => iframe },
    acquireVsCodeApi: () => ({ postMessage: (m: unknown) => toExtension.push(m) }),
    window: { addEventListener: on },
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);

  const send = (data: unknown) => listeners['message'].forEach((fn) => fn({ data }));
  return { send, toIframe, toExtension, listeners };
}

test('cờ ẩn/hiện đi XUỐNG trang, không đi lên extension', () => {
  const b = runBridge();
  b.send({ command: 'aimon.visibility', visible: false });
  assert.deepEqual(b.toIframe, [{ command: 'aimon.visibility', visible: false }]);
  assert.deepEqual(b.toExtension, []);
});

test('bấm nhân vật trong cửa sổ nổi đi LÊN extension, không vòng ngược xuống iframe', () => {
  // Vòng ngược xuống là trang lại gửi lên lần nữa - một vòng lặp tin nhắn vô tận.
  const b = runBridge();
  b.send({ command: 'aimon.openPanel', agent: 'abc', pid: 123 });
  assert.deepEqual(b.toExtension, [{ command: 'aimon.openPanel', agent: 'abc', pid: 123 }]);
  assert.deepEqual(b.toIframe, []);
});

test('tin lạ thì bỏ qua cả hai chiều', () => {
  const b = runBridge();
  b.send({ command: 'something.else' });
  b.send(null);
  assert.deepEqual(b.toExtension, []);
  assert.deepEqual(b.toIframe, []);
});

test('iframe nạp xong sau thì cờ ẩn/hiện được gửi lại', () => {
  // Không gửi lại thì trang không bao giờ biết mình đang bị giấu và cứ hỏi server mãi.
  const b = runBridge();
  b.send({ command: 'aimon.visibility', visible: false });
  b.listeners['load'].forEach((fn) => fn());
  assert.equal(b.toIframe.length, 2);
});
