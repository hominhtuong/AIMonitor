/**
 * Các trang phụ của webview (đang tải, lỗi, chưa có Python). Dùng chung cho cả panel hẹp ở
 * activity bar lẫn tab rộng trong editor - hai nơi này chỉ khác nhau ở dashboard thật, còn
 * mấy trang trạng thái thì giống hệt.
 *
 * Màu lấy từ biến của VSCode nên tự hợp với theme người dùng đang dùng.
 */

const PYTHON_DOWNLOAD_URL = 'https://www.python.org/downloads/';
export const WINGET_COMMAND = 'winget install -e --id Python.Python.3.12';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Trang bọc dashboard: một `<iframe>` trỏ về server localhost, cộng cầu nối báo xuống trang
 * biết mình đang hiện hay đang bị giấu.
 *
 * Vì sao cần cầu nối: `retainContextWhenHidden` giữ webview sống khi user thu gọn panel hoặc
 * chuyển sang tab khác - bắt buộc phải giữ, không thì server bị giết rồi spawn lại liên tục.
 * Cái giá là trang bên trong không biết mình bị giấu, vì VSCode giấu bằng `display:none` mà
 * Page Visibility API không tính chuyện đó: `document.hidden` vẫn false, `setInterval` vẫn
 * chạy đủ nhịp, `requestAnimationFrame` vẫn quay 60 fps. Đã đo tận nơi (docs/hieu-nang.md).
 * Không có cầu nối này thì thu gọn panel xong server vẫn bị hỏi mỗi 3 giây, mãi mãi.
 *
 * Hai chặng vì dashboard khác origin với trang webview: extension => webview => iframe.
 * `'*'` làm targetOrigin chấp nhận được, nội dung chỉ là một cờ bật tắt.
 *
 * `fill` khác nhau giữa hai khung nhìn: panel hẹp dùng 100% chiều ngang, tab dùng 100vw.
 */
export function dashboardFramePage(url: string, wide: boolean): string {
  const size = wide ? 'width:100vw;height:100vh' : 'width:100%;height:100vh';
  const body = wide ? 'margin:0;padding:0;overflow:hidden' : 'margin:0;padding:0';
  return `<!DOCTYPE html><html><body style="${body}">` +
    `<iframe id="f" src="${url}" style="border:0;${size}"></iframe>` +
    `<script>
      const f = document.getElementById('f');
      let last = null;
      window.addEventListener('message', (e) => {
        const m = e.data;
        if (!m || m.command !== 'aimon.visibility') return;
        last = m;
        if (f.contentWindow) f.contentWindow.postMessage(m, '*');
      });
      // Iframe nạp xong SAU khi webview đã nhận tin thì phải gửi lại, không thì trang không
      // bao giờ biết mình đang bị giấu.
      f.addEventListener('load', () => {
        if (last && f.contentWindow) f.contentWindow.postMessage(last, '*');
      });
    </script>` +
    `</body></html>`;
}

function page(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: var(--vscode-font-family); font-size: 13px; padding: 14px;
           color: var(--vscode-foreground); }
    h3 { margin: 0 0 8px; font-size: 14px; }
    p { line-height: 1.5; }
    code, pre { font-family: var(--vscode-editor-font-family);
                background: var(--vscode-textCodeBlock-background); border-radius: 3px; }
    code { padding: 1px 4px; }
    pre { padding: 8px; overflow-x: auto; white-space: pre-wrap; }
    button { font: inherit; padding: 5px 12px; margin: 4px 6px 0 0; cursor: pointer;
             border: 0; border-radius: 3px;
             color: var(--vscode-button-foreground);
             background: var(--vscode-button-background); }
    button.secondary { color: var(--vscode-button-secondaryForeground);
                       background: var(--vscode-button-secondaryBackground); }
  </style></head><body>${body}
  <script>
    const vscodeApi = acquireVsCodeApi();
    document.querySelectorAll('button[data-command]').forEach((b) => {
      b.addEventListener('click', () => vscodeApi.postMessage({ command: b.dataset.command }));
    });
  </script></body></html>`;
}

export function renderLoadingPage(): string {
  return page('<p>Đang khởi động AI Monitor...</p>');
}

export function renderNoPythonPage(platform: string = process.platform): string {
  const winget =
    platform === 'win32'
      ? `<p>Hoặc cài nhanh bằng lệnh:</p><pre>${WINGET_COMMAND}</pre>`
      : '';
  return page(
    `<h3>Chưa có Python trên máy</h3>` +
      `<p>AI Monitor cần <b>Python 3.9 trở lên</b>. Extension đã quét PATH, py launcher và ` +
      `các thư mục cài mặc định nhưng không thấy bản nào.</p>` +
      winget +
      `<p>Trên Windows nhớ tick <b>"Add python.exe to PATH"</b> lúc cài.</p>` +
      `<button data-command="install-python">Tải Python</button>` +
      `<button class="secondary" data-command="retry">Thử lại</button>`
  );
}

export function renderErrorPage(message: string): string {
  return page(
    `<h3>AI Monitor không khởi động được</h3>` +
      `<pre>${escapeHtml(message)}</pre>` +
      `<button data-command="retry">Thử lại</button>`
  );
}

export { PYTHON_DOWNLOAD_URL };
