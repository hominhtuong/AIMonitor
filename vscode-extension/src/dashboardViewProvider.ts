import * as vscode from 'vscode';
import { ChildProcess } from 'node:child_process';
import { spawnAimonServer, waitForServer, stopAimonServer, probeVersion, getSpawnInfo } from './serverManager';
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

  constructor(private readonly extensionUri: vscode.Uri) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.loadingHtml();

    // Dừng server khi webview bị dispose (vd panel bị đóng) thay vì để nó sống tới tận
    // deactivate(). Lưu ý: trên Windows, SIGTERM không khiến finally trong server.py chạy
    // (giới hạn Node/Windows: SIGTERM map sang TerminateProcess) - out of scope lượt fix này.
    webviewView.onDidDispose(() => {
      if (this.proc) {
        stopAimonServer(this.proc);
        this.proc = undefined;
      }
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
      if (this.proc && getSpawnInfo(this.proc)?.enoent) {
        vscode.window.showErrorMessage(
          'AI Monitor could not find a Python 3 interpreter on PATH. ' +
            'Install Python 3 (https://www.python.org/downloads/) and reload the window.'
        );
      }
    }
  }

  /**
   * Nếu một server aimon còn sống (đọc từ instance.json rồi probe HTTP), dùng lại nó thay vì
   * kill-rồi-spawn-lại: spawn lại ngay sau kill gây race với cơ chế single-instance của
   * server.py (instance.json cũ chưa kịp xoá khi tiến trình mới đã kiểm tra xong). Chỉ kill +
   * spawn mới khi thật sự không có instance nào đang sống.
   */
  private async ensureServer(): Promise<AimonInstance> {
    const existing = readInstanceFile();
    if (existing && (await probeVersion(existing.host, existing.port))) {
      return existing;
    }

    if (this.proc) {
      stopAimonServer(this.proc);
      this.proc = undefined;
    }
    this.proc = await spawnAimonServer(this.extensionUri.fsPath);
    return waitForServer(undefined, undefined, undefined, this.proc);
  }

  dispose(): void {
    if (this.proc) {
      stopAimonServer(this.proc);
      this.proc = undefined;
    }
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
      `<p>AI Monitor failed to start: ${escapeHtml(message)}</p>` +
      `<p>Make sure <code>python3</code> is installed and on your PATH.</p>` +
      `</body></html>`;
  }
}
