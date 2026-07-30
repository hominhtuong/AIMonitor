import * as vscode from 'vscode';
import { DashboardViewProvider } from './dashboardViewProvider';

let provider: DashboardViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  provider = new DashboardViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, provider)
  );
}

export function deactivate(): void {
  provider?.dispose();
  provider = undefined;
}
