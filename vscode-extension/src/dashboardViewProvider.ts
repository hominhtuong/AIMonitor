import * as vscode from 'vscode';
import { AimonServerSession } from './serverSession';
import { AimonConfig, resolveTheme, editorIsLight, extensionVersion } from './config';
import { dashboardUrl } from './usage';
import { PythonNotFoundError } from './serverManager';
import {
  renderErrorPage,
  renderLoadingPage,
  renderNoPythonPage,
  dashboardFramePage,
  WINGET_COMMAND,
} from './webviewPages';

const HOLDER = 'sidebar';

/**
 * Dashboard trong panel hẹp ở activity bar.
 *
 * Chạy ở chế độ **compact**: cột bên trái chỉ rộng vài trăm pixel, bày đủ bảng biểu như tab
 * rộng thì không đọc được gì. Muốn xem đầy đủ thì mở tab (lệnh AI Monitor: Open Dashboard in
 * a Tab, hoặc bấm nút ở thanh trạng thái).
 */
export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'aimon.dashboardView';

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly session: AimonServerSession,
    private config: AimonConfig
  ) {}

  setConfig(config: AimonConfig): void {
    this.config = config;
  }

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage((msg: { command?: string }) => {
      if (msg?.command === 'retry') void this.load();
      if (msg?.command === 'install-python') void this.openPythonDownload();
    });

    // `retainContextWhenHidden` giữ webview sống khi user thu gọn panel - cần thiết, nếu
    // không server bị giết rồi spawn lại liên tục. Cái giá là trang bên trong KHÔNG biết
    // mình đang bị giấu: VSCode giấu bằng `display:none`, mà Page Visibility API không tính
    // chuyện đó, nên `document.hidden` vẫn false và trang cứ hỏi server 207 KB mỗi 3 giây
    // cộng vòng vẽ 60 fps, mãi mãi, cho một cái panel không ai nhìn. Đã đo tận nơi, xem
    // docs/hieu-nang.md. Đây là chỗ duy nhất biết sự thật, nên phải tự báo xuống.
    webviewView.onDidChangeVisibility(() => this.pushVisibility());

    webviewView.onDidDispose(() => {
      this.view = undefined;
      void this.session.release(HOLDER);
    });

    await this.load();
  }

  /** Vẽ lại khi settings đổi, nhưng chỉ khi panel đang mở. */
  async reload(): Promise<void> {
    if (this.view) await this.load();
  }

  private async load(): Promise<void> {
    const view = this.view;
    if (!view) return;
    view.webview.html = renderLoadingPage();

    try {
      const instance = await this.session.acquire(HOLDER);
      const external = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://${instance.host}:${instance.port}/`)
      );
      const url = dashboardUrl(external.toString(), {
        theme: resolveTheme(this.config.theme, editorIsLight(vscode.window.activeColorTheme.kind)),
        refreshSeconds: this.config.refreshSeconds,
        compact: true,
        aiKinds: this.config.aiKinds,
        officePack: this.config.officePack,
        officeScene: this.config.officeScene,
        extVersion: extensionVersion(),
      });
      view.webview.html = dashboardFramePage(url, false);
      this.pushVisibility();
    } catch (err) {
      if (err instanceof PythonNotFoundError) {
        view.webview.html = renderNoPythonPage();
        void this.promptInstallPython();
        return;
      }
      view.webview.html = renderErrorPage(err instanceof Error ? err.message : String(err));
    }
  }

  private pushVisibility(): void {
    const view = this.view;
    if (!view) return;
    void view.webview.postMessage({ command: 'aimon.visibility', visible: view.visible });
  }

  private async promptInstallPython(): Promise<void> {
    const isWindows = process.platform === 'win32';
    const actions = isWindows ? ['Tải Python', 'Cài bằng winget'] : ['Tải Python'];
    const choice = await vscode.window.showWarningMessage(
      'AI Monitor cần Python 3.9 trở lên. Máy này chưa có bản nào - cài xong bấm "Thử lại" trong panel là dùng được ngay.',
      ...actions
    );
    if (choice === 'Tải Python') await this.openPythonDownload();
    if (choice === 'Cài bằng winget') {
      const term = vscode.window.createTerminal('Cài Python cho AI Monitor');
      term.show();
      term.sendText(WINGET_COMMAND, false); // false: gõ sẵn, người dùng tự bấm Enter
    }
  }

  private async openPythonDownload(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
  }
}
