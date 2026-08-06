import * as vscode from 'vscode';
import * as http from 'node:http';
import { AimonServerSession } from './serverSession';
import { AimonConfig } from './config';
import { summarize, statusText, severityOf, formatDuration, pctText, fmtTokens, UsageSummary } from './usage';

function getJson(host: string, port: number, path: string, timeoutMs = 4000): Promise<unknown> {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Nút ở thanh trạng thái dưới cùng cửa sổ.
 *
 * Nguyên tắc: **không bao giờ tự bật server**. Nó chỉ hỏi xem đã có AI Monitor nào đang chạy
 * chưa (app macOS, bản .exe, hay cửa sổ VSCode khác) rồi hiện số; chưa có thì nằm im ở dạng
 * nhãn mờ. Bấm vào mới bật. Nhờ vậy mở VSCode lên không phát sinh thêm tiến trình Python nào.
 */
export class AimonStatusBar {
  private item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(
    private readonly session: AimonServerSession,
    private config: AimonConfig
  ) {
    this.item = vscode.window.createStatusBarItem(
      config.statusBarAlignment === 'left'
        ? vscode.StatusBarAlignment.Left
        : vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'aimon.openDashboard';
    this.item.text = '$(pulse) AI Monitor';
    this.item.tooltip = 'AI Monitor - bấm để mở dashboard';
  }

  start(): void {
    this.apply(this.config);
    void this.tick();
  }

  apply(config: AimonConfig): void {
    this.config = config;
    if (config.statusBarEnabled) this.item.show();
    else this.item.hide();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.disposed || !this.config.statusBarEnabled) return;
    // Nhịp riêng, chậm hơn dashboard: thanh trạng thái chỉ cần đủ để người dùng liếc mắt,
    // không cần theo kịp từng lần dashboard vẽ lại.
    const ms = Math.max(5, this.config.refreshSeconds * 2) * 1000;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.disposed) return;
    try {
      const instance = await this.session.peek();
      if (!instance) {
        this.render(null);
        return;
      }
      const snap = await getJson(instance.host, instance.port, '/api/snapshot');
      this.render(snap ? summarize(snap) : null);
    } finally {
      this.schedule();
    }
  }

  private render(u: UsageSummary | null): void {
    this.item.text = statusText(u, this.config.statusBarMetric);
    const sev = severityOf(u);
    this.item.backgroundColor =
      sev === 'danger'
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : sev === 'warn'
          ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;

    if (!u) {
      this.item.tooltip = 'AI Monitor chưa chạy - bấm để mở dashboard';
      return;
    }
    const tip = new vscode.MarkdownString();
    tip.appendMarkdown(`**AI Monitor**\n\n`);
    tip.appendMarkdown(`- Session (5 giờ): ${pctText(u.sessionPct)}`);
    const left = formatDuration(u.resetsInSec);
    tip.appendMarkdown(left ? ` · còn ${left}\n` : '\n');
    tip.appendMarkdown(`- Weekly (7 ngày): ${pctText(u.weeklyPct)}\n`);
    tip.appendMarkdown(`- Token hôm nay: ${fmtTokens(u.todayTokens)}\n`);
    tip.appendMarkdown(`- Chi phí hôm nay: $${(u.todayCost ?? 0).toFixed(2)}\n`);
    if (u.estimated) tip.appendMarkdown(`\n_Số ước lượng từ transcript, không phải số chính thức._`);
    this.item.tooltip = tip;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.item.dispose();
  }
}
