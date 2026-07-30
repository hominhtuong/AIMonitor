import * as vscode from 'vscode';
import { ChildProcess } from 'node:child_process';
import { spawnAimonServer, waitForServer, stopAimonServer } from './serverManager';

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

    try {
      this.proc = spawnAimonServer(this.extensionUri.fsPath);
      const instance = await waitForServer();
      const external = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://${instance.host}:${instance.port}/`)
      );
      webviewView.webview.html = this.iframeHtml(external.toString());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      webviewView.webview.html = this.errorHtml(message);
    }
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
