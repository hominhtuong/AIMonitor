import * as vscode from 'vscode';
import * as http from 'node:http';
import { AimonServerSession } from './serverSession';
import { AimonInstance } from './instanceFile';
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

const HOLDER = 'statusbar';

/**
 * Nút ở thanh trạng thái dưới cùng cửa sổ.
 *
 * Tự bật server nếu chưa có ai chạy (giữ chỗ qua `AimonServerSession.acquire`, cùng cơ chế
 * đếm người giữ với panel/tab/cửa sổ nổi) - đổi lại là mở VSCode lên đã có số ngay, không cần
 * bấm vào mở dashboard trước. Có server sẵn (app macOS, .exe, cửa sổ VSCode khác) thì dùng
 * chung, không bật thêm bản thứ hai.
 */
export class AimonStatusBar {
  private item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;
  private held = false;

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
    this.item.tooltip = 'AI Monitor - đang bật server...';
  }

  start(): void {
    this.apply(this.config);
    void this.tick();
  }

  apply(config: AimonConfig): void {
    this.config = config;
    if (config.statusBarEnabled) {
      this.item.show();
    } else {
      this.item.hide();
      if (this.held) {
        this.held = false;
        void this.session.release(HOLDER);
      }
    }
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
      if (!this.config.statusBarEnabled) {
        this.render(null);
        return;
      }
      let instance: AimonInstance | null | undefined;
      if (!this.held) {
        this.held = true;
        try {
          instance = await this.session.acquire(HOLDER);
        } catch {
          this.held = false; // bật hỏng thì bỏ giữ chỗ, tick sau thử lại
        }
      } else {
        instance = await this.session.peek();
      }
      if (!instance) {
        this.render(null);
        return;
      }
      // `/api/usage` chứ KHÔNG phải `/api/snapshot`: thanh trạng thái chỉ đọc `usage` và
      // `totals.today.cost`, tức 2.3 KB trong 207 KB. Hỏi bằng snapshot là bắt server quét
      // `ps` toàn máy cộng `lsof` (86 ms CPU tính cả tiến trình con) chỉ để in ra hai con số
      // phần trăm - mà mỗi cửa sổ VSCode lại hỏi 6 giây một lần. Đo được: 3.5 ms so với
      // 86 ms, xem docs/hieu-nang.md.
      const usage = await getJson(instance.host, instance.port, '/api/usage');
      this.render(usage ? summarize(usage) : null);
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
    if (this.held) {
      this.held = false;
      void this.session.release(HOLDER);
    }
    this.item.dispose();
  }
}
