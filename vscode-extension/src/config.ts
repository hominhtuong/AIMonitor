import * as vscode from 'vscode';
import { StatusMetric } from './usage';

/**
 * Một chỗ duy nhất đọc settings. Không rải `getConfiguration` khắp nơi: giá trị mặc định khai
 * ở `package.json` mà lặp lại trong code là hai nguồn sự thật, sửa một chỗ quên chỗ kia.
 */

export type OpenTarget = 'tab' | 'panel';
export type { StatusMetric } from './usage';
export type ThemeChoice = 'auto' | 'dark' | 'light';

export interface AimonConfig {
  pythonPath: string;
  serverPort: number;
  reuseRunningInstance: boolean;
  openIn: OpenTarget;
  statusBarEnabled: boolean;
  statusBarMetric: StatusMetric;
  statusBarAlignment: 'left' | 'right';
  refreshSeconds: number;
  theme: ThemeChoice;
  claudeDataDir: string;
  pricingFile: string;
}

export function readConfig(): AimonConfig {
  const c = vscode.workspace.getConfiguration('aimon');
  return {
    pythonPath: (c.get<string>('pythonPath') ?? '').trim(),
    serverPort: c.get<number>('serverPort') ?? 0,
    reuseRunningInstance: c.get<boolean>('reuseRunningInstance') ?? true,
    openIn: (c.get<OpenTarget>('openIn') ?? 'tab'),
    statusBarEnabled: c.get<boolean>('statusBar.enabled') ?? true,
    statusBarMetric: (c.get<StatusMetric>('statusBar.metric') ?? 'both'),
    statusBarAlignment: (c.get<'left' | 'right'>('statusBar.alignment') ?? 'right'),
    refreshSeconds: c.get<number>('refreshSeconds') ?? 3,
    theme: (c.get<ThemeChoice>('theme') ?? 'auto'),
    claudeDataDir: (c.get<string>('claudeDataDir') ?? '').trim(),
    pricingFile: (c.get<string>('pricingFile') ?? '').trim(),
  };
}

export function updateConfig<T>(key: string, value: T): Thenable<void> {
  return vscode.workspace
    .getConfiguration('aimon')
    .update(key, value, vscode.ConfigurationTarget.Global);
}

/** `auto` phải quy ra dark/light thật, vì trang web không nhìn thấy theme của VSCode.
 * Nhận boolean chứ không nhận ColorThemeKind để hàm không phụ thuộc vào enum của vscode. */
export function resolveTheme(choice: ThemeChoice, editorIsLight: boolean): 'dark' | 'light' {
  if (choice !== 'auto') return choice;
  return editorIsLight ? 'light' : 'dark';
}

/** VSCode có hai kiểu theme sáng: Light và High Contrast Light. */
export function editorIsLight(kind: vscode.ColorThemeKind): boolean {
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}
