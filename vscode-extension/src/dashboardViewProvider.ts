import * as vscode from 'vscode';
import { ChildProcess } from 'node:child_process';
import {
  startWithDiscoveredPython,
  shutdownAimonServer,
  probeVersion,
  PythonNotFoundError,
} from './serverManager';
import { readInstanceFile, AimonInstance } from './instanceFile';

const PYTHON_DOWNLOAD_URL = 'https://www.python.org/downloads/';
const WINGET_COMMAND = 'winget install -e --id Python.Python.3.12';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'aimon.dashboardView';

  private proc: ChildProcess | undefined;
  /** Instance của server do CHÍNH provider này bật, để tắt êm qua /api/quit. */
  private ownInstance: AimonInstance | undefined;
  private view: vscode.WebviewView | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    // Nút trong trang lỗi gửi message ra đây - webview không tự mở link ngoài hay chạy lệnh được.
    webviewView.webview.onDidReceiveMessage((msg: { command?: string }) => {
      if (msg?.command === 'install-python') void this.openPythonDownload();
      if (msg?.command === 'retry') void this.load();
    });

    webviewView.onDidDispose(() => {
      void this.stopOwnServer();
    });

    await this.load();
  }

  private async load(): Promise<void> {
    const view = this.view;
    if (!view) return;
    view.webview.html = this.loadingHtml();

    try {
      const instance = await this.ensureServer();
      const external = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://${instance.host}:${instance.port}/`)
      );
      view.webview.html = this.iframeHtml(external.toString());
    } catch (err) {
      if (err instanceof PythonNotFoundError) {
        view.webview.html = this.noPythonHtml();
        void this.promptInstallPython();
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      view.webview.html = this.errorHtml(message);
    }
  }

  private async promptInstallPython(): Promise<void> {
    const isWindows = process.platform === 'win32';
    const actions = isWindows
      ? ['Tải Python', 'Cài bằng winget']
      : ['Tải Python'];
    const choice = await vscode.window.showWarningMessage(
      'AI Monitor cần Python 3.9 trở lên. Máy này chưa có bản nào - cài xong bấm "Thử lại" trong panel là dùng được ngay.',
      ...actions
    );
    if (choice === 'Tải Python') await this.openPythonDownload();
    if (choice === 'Cài bằng winget') {
      const term = vscode.window.createTerminal('Cài Python cho AI Monitor');
      term.show();
      term.sendText(WINGET_COMMAND, false); // false: chỉ gõ sẵn, người dùng tự bấm Enter
    }
  }

  private async openPythonDownload(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(PYTHON_DOWNLOAD_URL));
  }

  /**
   * Server aimon còn sống (đọc instance.json rồi probe HTTP) thì dùng lại thay vì
   * kill-rồi-spawn-lại: spawn lại ngay sau kill gây race với cơ chế single-instance của
   * server.py. Server đó có thể là của app macOS/Windows standalone hoặc của cửa sổ VSCode
   * khác - dùng chung được, và vì không phải của mình nên `ownInstance` để trống, đóng panel
   * không giết nhầm.
   */
  private async ensureServer(): Promise<AimonInstance> {
    const existing = readInstanceFile();
    if (existing && (await probeVersion(existing.host, existing.port))) {
      return existing;
    }

    await this.stopOwnServer();
    const started = await startWithDiscoveredPython(this.extensionUri.fsPath);
    this.proc = started.proc;
    this.ownInstance = started.instance;
    return started.instance;
  }

  private async stopOwnServer(): Promise<void> {
    const proc = this.proc;
    const instance = this.ownInstance;
    this.proc = undefined;
    this.ownInstance = undefined;
    if (proc) await shutdownAimonServer(proc, instance);
  }

  dispose(): void {
    void this.stopOwnServer();
  }

  private page(body: string): string {
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

  private loadingHtml(): string {
    return this.page('<p>Đang khởi động AI Monitor...</p>');
  }

  private iframeHtml(url: string): string {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0">` +
      `<iframe src="${url}" style="border:0;width:100%;height:100vh"></iframe>` +
      `</body></html>`;
  }

  private noPythonHtml(): string {
    const winget = process.platform === 'win32'
      ? `<p>Hoặc cài nhanh bằng lệnh:</p><pre>${WINGET_COMMAND}</pre>`
      : '';
    return this.page(
      `<h3>Chưa có Python trên máy</h3>` +
        `<p>AI Monitor cần <b>Python 3.9 trở lên</b>. Extension đã quét PATH, py launcher và ` +
        `các thư mục cài mặc định nhưng không thấy bản nào.</p>` +
        winget +
        `<p>Trên Windows nhớ tick <b>"Add python.exe to PATH"</b> lúc cài.</p>` +
        `<button data-command="install-python">Tải Python</button>` +
        `<button class="secondary" data-command="retry">Thử lại</button>`
    );
  }

  private errorHtml(message: string): string {
    return this.page(
      `<h3>AI Monitor không khởi động được</h3>` +
        `<pre>${escapeHtml(message)}</pre>` +
        `<button data-command="retry">Thử lại</button>`
    );
  }
}
