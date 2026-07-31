import * as vscode from 'vscode';
import { AimonServerSession } from './serverSession';
import { AimonConfig, resolveTheme, editorIsLight } from './config';
import { dashboardUrl } from './usage';
import { PythonNotFoundError } from './serverManager';
import { renderErrorPage, renderLoadingPage, renderNoPythonPage } from './webviewPages';

const HOLDER = 'tab';

/**
 * Dashboard mở thành một tab trong khu vực editor - khác với panel hẹp ở activity bar.
 *
 * Cùng một server, cùng một trang web, nhưng tab được cả chiều rộng cửa sổ nên hiện đủ bảng
 * biểu; panel bên trái chạy ở chế độ compact. Đó là lý do có hai lối vào chứ không phải một.
 */
export class DashboardPanel {
  private static current: DashboardPanel | undefined;

  static async show(
    session: AimonServerSession,
    config: AimonConfig,
    extensionUri: vscode.Uri
  ): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel('aimon.dashboardTab', 'AI Monitor', column, {
      enableScripts: true,
      // Không giữ thì mỗi lần chuyển tab là webview bị huỷ, server bị nhả rồi bật lại.
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    });
    DashboardPanel.current = new DashboardPanel(panel, session, config);
    await DashboardPanel.current.load();
  }

  /** Đổi settings thì vẽ lại bằng URL mới (theme, nhịp làm mới nằm trong query). */
  static async refreshOpen(config: AimonConfig): Promise<void> {
    if (!DashboardPanel.current) return;
    DashboardPanel.current.config = config;
    await DashboardPanel.current.load();
  }

  static isOpen(): boolean {
    return DashboardPanel.current !== undefined;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly session: AimonServerSession,
    private config: AimonConfig
  ) {
    panel.webview.onDidReceiveMessage((msg: { command?: string }) => {
      if (msg?.command === 'retry') void this.load();
      if (msg?.command === 'install-python') {
        void vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
      }
    });
    panel.onDidDispose(() => {
      DashboardPanel.current = undefined;
      void this.session.release(HOLDER);
    });
  }

  private async load(): Promise<void> {
    this.panel.webview.html = renderLoadingPage();
    try {
      const instance = await this.session.acquire(HOLDER);
      const external = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://${instance.host}:${instance.port}/`)
      );
      const url = dashboardUrl(external.toString(), {
        theme: resolveTheme(this.config.theme, editorIsLight(vscode.window.activeColorTheme.kind)),
        refreshSeconds: this.config.refreshSeconds,
        compact: false,
      });
      this.panel.webview.html = iframePage(url);
    } catch (err) {
      if (err instanceof PythonNotFoundError) {
        this.panel.webview.html = renderNoPythonPage();
        return;
      }
      this.panel.webview.html = renderErrorPage(
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

function iframePage(url: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden">` +
    `<iframe src="${url}" style="border:0;width:100vw;height:100vh"></iframe>` +
    `</body></html>`;
}
