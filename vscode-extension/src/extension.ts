import * as vscode from 'vscode';
import { DashboardViewProvider } from './dashboardViewProvider';
import { DashboardPanel } from './dashboardPanel';
import { AimonServerSession } from './serverSession';
import { AimonStatusBar } from './statusBar';
import { readConfig, updateConfig } from './config';
import { findPythons } from './pythonFinder';
import {
  syncDetectedSettings,
  detectAndFill,
  pickClaudeDir,
  pickPricingFile,
  showResolvedConfig,
} from './autoConfig';

let session: AimonServerSession | undefined;
let statusBar: AimonStatusBar | undefined;
let provider: DashboardViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  let config = readConfig();
  session = new AimonServerSession(context.extensionUri.fsPath, config);
  provider = new DashboardViewProvider(session, config);
  statusBar = new AimonStatusBar(session, config);

  context.subscriptions.push(
    // retainContextWhenHidden: VSCode dispose webview view ngay khi user thu gọn panel hoặc
    // đổi container. Không giữ context thì server bị nhả rồi bật lại liên tục, và lần đọc đầu
    // sau mỗi lần spawn còn cho %CPU sai vì mất snapshot mồi.
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    statusBar,

    vscode.commands.registerCommand('aimon.openDashboard', async () => {
      const cfg = readConfig();
      if (cfg.openIn === 'panel') {
        await vscode.commands.executeCommand('aimon.dashboardView.focus');
        return;
      }
      await DashboardPanel.show(session!, cfg, context.extensionUri);
    }),

    vscode.commands.registerCommand('aimon.selectPython', () => pickPython()),
    vscode.commands.registerCommand('aimon.selectClaudeDir', () => pickClaudeDir()),
    vscode.commands.registerCommand('aimon.selectPricingFile', () =>
      pickPricingFile(context.extensionUri.fsPath)),
    vscode.commands.registerCommand('aimon.detectSettings', () => detectAndFill(context)),
    vscode.commands.registerCommand('aimon.showResolvedConfig', () => showResolvedConfig(context)),

    vscode.commands.registerCommand('aimon.restartServer', async () => {
      await session!.dispose();
      await provider!.reload();
      await DashboardPanel.refreshOpen(readConfig());
      vscode.window.showInformationMessage('AI Monitor: đã khởi động lại server.');
    }),

    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('aimon')) return;
      config = readConfig();
      session!.setConfig(config);
      provider!.setConfig(config);
      statusBar!.apply(config);
      await provider!.reload();
      await DashboardPanel.refreshOpen(config);
    }),

    // Đổi theme VSCode mà aimon.theme để 'auto' thì dashboard phải đổi theo.
    vscode.window.onDidChangeActiveColorTheme(async () => {
      if (readConfig().theme !== 'auto') return;
      await provider!.reload();
      await DashboardPanel.refreshOpen(readConfig());
    })
  );

  statusBar.start();

  // Dò rồi điền sẵn ba ô đường dẫn, và dọn giá trị đã chết. Chạy nền, KHÔNG await: dò Python
  // phải chạy thử từng bản nên mất vài giây, chặn activate() ở đó là cả cửa sổ VSCode đứng
  // hình. Cũng không cần server chạy - dò là việc độc lập.
  void syncDetectedSettings(context).catch(() => { /* dò hỏng thì cứ để trống, vẫn tự dò */ });
}

/**
 * Liệt kê mọi Python dò được cho người dùng bấm chọn, thay vì bắt gõ tay đường dẫn. Mỗi mục
 * đã qua bước chạy thử nên chắc chắn dùng được - không có chuyện chọn xong mới biết hỏng.
 */
async function pickPython(): Promise<void> {
  const found = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'AI Monitor: đang dò Python...' },
    () => findPythons()
  );

  const items: (vscode.QuickPickItem & { value: string })[] = found.map((p) => ({
    label: `$(snake) Python ${p.version.join('.')}`,
    description: [p.command, ...p.args].join(' '),
    detail: `Tìm thấy qua ${p.source}`,
    value: p.command,
  }));
  items.unshift({
    label: '$(search) Tự dò',
    description: 'mặc định',
    detail: 'Để trống aimon.pythonPath và tự chọn bản đầu tiên chạy được',
    value: '',
  });

  if (found.length === 0) {
    const go = await vscode.window.showWarningMessage(
      'Không tìm thấy Python 3.9 trở lên nào trên máy.',
      'Tải Python'
    );
    if (go) await vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
    return;
  }

  const chosen = await vscode.window.showQuickPick(items, {
    title: 'Chọn Python cho AI Monitor',
    placeHolder: `Dò được ${found.length} bản`,
  });
  if (!chosen) return;

  await updateConfig('pythonPath', chosen.value);
  await vscode.commands.executeCommand('aimon.restartServer');
}

export function deactivate(): void {
  void session?.dispose();
  session = undefined;
  statusBar = undefined;
  provider = undefined;
}
