import * as vscode from 'vscode';
import { DashboardViewProvider } from './dashboardViewProvider';

let provider: DashboardViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  provider = new DashboardViewProvider(context.extensionUri);
  context.subscriptions.push(
    // retainContextWhenHidden: VSCode dispose webview view ngay khi user thu gọn panel hoặc
    // đổi sang container khác. Không giữ lại thì onDidDispose bắn SIGTERM, server Python chết
    // và phải spawn lại mỗi lần mở - tốn công khởi động, mà %CPU lần đọc đầu cũng sai vì mất
    // snapshot mồi (server.py cần 2 lần đo liên tiếp mới tính được delta).
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

export function deactivate(): void {
  provider?.dispose();
  provider = undefined;
}
