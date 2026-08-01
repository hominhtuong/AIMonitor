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
} from './webviewPages';

const HOLDER = 'pip';

/**
 * Khung nhìn Văn phòng tách ra thành một cửa sổ nổi, luôn nằm trên mọi ứng dụng khác.
 *
 * **Chỉ mở khi người dùng gọi lệnh `AI Monitor: Open the Office in a Floating Window`.** Bản
 * trước tự bật cửa sổ này mỗi khi dashboard khuất mắt (đóng panel, đổi container, chuyển tab);
 * đã gỡ theo yêu cầu của người dùng - cửa sổ nhảy ra giữa lúc đang làm việc khác gây khó chịu
 * hơn là tiện. Đừng làm lại kiểu tự động đó.
 *
 * VSCode **không** có API tạo cửa sổ nổi cho extension, nhưng có ba lệnh nội bộ ghép lại thì
 * ra đúng thứ đó. Đã đo trên 1.131: webview panel không bị dispose khi chuyển cửa sổ, vẫn
 * `visible`/`active`, `postMessage` hai chiều vẫn chạy và canvas vẫn giữ 60 fps.
 *
 *   1. `moveEditorToNewWindow`        đẩy tab đang active sang một cửa sổ phụ (cửa sổ OS thật)
 *   2. `enableCompactAuxiliaryWindow` bỏ title bar + thanh tab, còn mỗi nội dung
 *   3. `enableWindowAlwaysOnTop`      ghim nổi trên cả Chrome, Finder, Terminal...
 *
 * Bốn điều bắt buộc nhớ:
 *
 * - Cả ba lệnh tác động lên cửa sổ **đang focus**, và hai lệnh sau chỉ chạy cho cửa sổ **phụ**
 *   (workbench kiểm tra `vscodeWindowId` khác cửa sổ chính). Nên phải gọi liền nhau ngay sau
 *   khi tạo panel, đừng chèn thao tác nào ở giữa.
 * - `moveEditorToNewWindow` chuyển tab ĐANG ACTIVE chứ không nhận tham số, nên panel phải được
 *   tạo với `preserveFocus: false`. Tạo xong mà người dùng kịp bấm sang tab khác thì lệnh sẽ
 *   bốc nhầm tab của họ - đó là lý do không chờ webview nạp xong mới move.
 * - Cả hai lệnh 2 và 3 mới có ở bản VSCode gần đây, `engines` của extension thì để ^1.85. Mỗi
 *   lệnh bọc try/catch riêng: bản cũ vẫn được cửa sổ nổi, chỉ thiếu phần ghim.
 * - Không có API đặt kích thước / vị trí cửa sổ phụ (`auxiliary: {bounds}` là thứ nội bộ của
 *   VSCode, không lộ ra). Cửa sổ mở theo cỡ của nhóm editor nguồn, người dùng tự kéo.
 */
export class OfficePipWindow {
  private static current: OfficePipWindow | undefined;

  static isOpen(): boolean {
    return OfficePipWindow.current !== undefined;
  }

  static async show(
    session: AimonServerSession,
    config: AimonConfig,
    onPick: (agent: string) => void
  ): Promise<void> {
    if (OfficePipWindow.current) {
      OfficePipWindow.current.panel.reveal(undefined, false);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aimon.officePip',
      'AI Monitor',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        // Cửa sổ nổi bị che khuất vẫn là cửa sổ đang mở: không giữ context thì mỗi lần nó
        // mất focus là webview bị huỷ, server bị nhả rồi bật lại.
        retainContextWhenHidden: true,
      }
    );

    const win = new OfficePipWindow(panel, session, config, onPick);
    OfficePipWindow.current = win;
    await win.detach();
    await win.load();
  }

  static async refreshOpen(config: AimonConfig): Promise<void> {
    if (!OfficePipWindow.current) return;
    OfficePipWindow.current.config = config;
    await OfficePipWindow.current.load();
  }

  /** Đóng cửa sổ nổi: người dùng vừa bấm một nhân vật, dashboard đầy đủ lên thay chỗ. */
  static close(): void {
    OfficePipWindow.current?.panel.dispose();
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly session: AimonServerSession,
    private config: AimonConfig,
    private readonly onPick: (agent: string) => void
  ) {
    panel.webview.onDidReceiveMessage((msg: { command?: string; agent?: string }) => {
      if (msg?.command === 'retry') void this.load();
      if (msg?.command === 'install-python') {
        void vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
      }
      if (msg?.command === 'aimon.openPanel') this.onPick(msg.agent ?? '');
    });

    panel.onDidDispose(() => {
      OfficePipWindow.current = undefined;
      void this.session.release(HOLDER);
    });
  }

  /** Ba lệnh của workbench, mỗi lệnh một try/catch. Xem chú thích đầu lớp. */
  private async detach(): Promise<void> {
    const step = async (command: string, wait: number) => {
      try {
        await vscode.commands.executeCommand(command);
      } catch {
        /* bản VSCode cũ không có lệnh này - vẫn dùng được, chỉ kém tiện hơn */
      }
      await new Promise((r) => setTimeout(r, wait));
    };
    await step('workbench.action.moveEditorToNewWindow', 250);
    await step('workbench.action.enableCompactAuxiliaryWindow', 120);
    await step('workbench.action.enableWindowAlwaysOnTop', 0);
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
        aiKinds: this.config.aiKinds,
        officePack: this.config.officePack,
        officeScene: this.config.officeScene,
        extVersion: extensionVersion(),
        view: 'office',
      });
      // Cửa sổ nổi KHÔNG gửi cờ visibility xuống: nó chỉ vẽ căn phòng, mà căn phòng thì luôn
      // là thứ người ta muốn thấy động đậy. Bị cửa sổ khác che thì vẫn phải chạy tiếp, khác
      // hẳn panel bị thu gọn - lúc đó không ai nhìn thật.
      this.panel.webview.html = dashboardFramePage(url, true);
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
