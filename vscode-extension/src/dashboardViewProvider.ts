import * as vscode from 'vscode';
import { ChildProcess } from 'node:child_process';
import { startAimonServer, shutdownAimonServer, probeVersion } from './serverManager';
import { readInstanceFile, AimonInstance } from './instanceFile';

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

  constructor(private readonly extensionUri: vscode.Uri) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.loadingHtml();

    // Dừng server khi webview bị dispose thay vì để nó sống tới tận deactivate().
    // Có retainContextWhenHidden nên thu gọn panel không dispose - chỉ đóng hẳn mới dispose.
    webviewView.onDidDispose(() => {
      void this.stopOwnServer();
    });

    try {
      const instance = await this.ensureServer();
      const external = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://${instance.host}:${instance.port}/`)
      );
      webviewView.webview.html = this.iframeHtml(external.toString());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      webviewView.webview.html = this.errorHtml(message);
      vscode.window.showErrorMessage(
        'AI Monitor could not start its Python server. Open the panel for details.'
      );
    }
  }

  /**
   * Nếu một server aimon còn sống (đọc từ instance.json rồi probe HTTP), dùng lại nó thay vì
   * kill-rồi-spawn-lại: spawn lại ngay sau kill gây race với cơ chế single-instance của
   * server.py (instance.json cũ chưa kịp xoá khi tiến trình mới đã kiểm tra xong). Server đó
   * có thể là của app macOS/Windows standalone hoặc của một cửa sổ VSCode khác - dùng chung
   * được, và vì không phải của mình nên `ownInstance` để trống, lúc đóng panel không giết nhầm.
   */
  private async ensureServer(): Promise<AimonInstance> {
    const existing = readInstanceFile();
    if (existing && (await probeVersion(existing.host, existing.port))) {
      return existing;
    }

    await this.stopOwnServer();
    const started = await startAimonServer(this.extensionUri.fsPath);
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

  private loadingHtml(): string {
    return `<!DOCTYPE html><html><body><p>Starting AI Monitor...</p></body></html>`;
  }

  private iframeHtml(url: string): string {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0">` +
      `<iframe src="${url}" style="border:0;width:100%;height:100vh"></iframe>` +
      `</body></html>`;
  }

  private errorHtml(message: string): string {
    return `<!DOCTYPE html><html><body>` +
      `<h3>AI Monitor failed to start</h3>` +
      `<pre style="white-space:pre-wrap">${escapeHtml(message)}</pre>` +
      `</body></html>`;
  }
}
