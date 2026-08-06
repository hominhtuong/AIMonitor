/**
 * Đọc snapshot của server thành mấy con số cho thanh trạng thái.
 *
 * File này cố ý KHÔNG import `vscode`: nhờ vậy unit test nạp được thẳng bằng node, không cần
 * dựng cả môi trường extension host.
 */

export type StatusMetric = 'both' | 'session' | 'weekly' | 'cost';

/** Ngưỡng đổi màu nền của nút. */
export const WARN_PCT = 70;
export const DANGER_PCT = 90;

export interface UsageSummary {
  sessionPct: number | null;
  weeklyPct: number | null;
  todayCost: number | null;
  todayTokens: number | null;
  /** true khi % là ước lượng từ transcript, không phải số chính thức của Anthropic. */
  estimated: boolean;
  resetsInSec: number | null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function summarize(snapshot: unknown): UsageSummary {
  const d = (snapshot ?? {}) as Record<string, any>;
  const five = d.usage?.five_hour ?? {};
  const seven = d.usage?.seven_day ?? {};
  return {
    sessionPct: num(five.pct),
    weeklyPct: num(seven.pct),
    todayCost: num(d.totals?.today?.cost),
    todayTokens: num(d.totals?.today?.total),
    estimated: five.source !== 'official',
    resetsInSec: num(five.resets_in),
  };
}

export function pctText(v: number | null): string {
  return v === null ? '--' : `${Math.round(v)}%`;
}

export function formatDuration(sec: number | null): string {
  if (sec === null || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}m`;
}

export function fmtTokens(n: number | null): string {
  if (n === null) return '--';
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  const unit = abs < 1_000_000 ? 1000 : 1_000_000;
  const suffix = abs < 1_000_000 ? 'K' : 'M';
  const v = Math.floor((n / unit) * 10) / 10;
  return `${v}${suffix}`;
}

/** `~` đứng trước số ước lượng - cùng quy ước dashboard đang dùng, để không ai tưởng đó là
 * con số chính thức. */
export function statusText(u: UsageSummary | null, metric: StatusMetric): string {
  if (!u) return '$(pulse) AI Monitor';
  const mark = u.estimated ? '~' : '';
  switch (metric) {
    case 'session':
      return `$(pulse) ${mark}${pctText(u.sessionPct)}`;
    case 'weekly':
      return `$(pulse) ${mark}${pctText(u.weeklyPct)} tuần`;
    case 'cost':
      return `$(pulse) $${(u.todayCost ?? 0).toFixed(2)}`;
    default:
      return `$(pulse) ${mark}${pctText(u.sessionPct)} · ${mark}${pctText(u.weeklyPct)}`;
  }
}

export function severityOf(u: UsageSummary | null): 'ok' | 'warn' | 'danger' {
  if (!u) return 'ok';
  const worst = Math.max(u.sessionPct ?? 0, u.weeklyPct ?? 0);
  if (worst >= DANGER_PCT) return 'danger';
  if (worst >= WARN_PCT) return 'warn';
  return 'ok';
}

/**
 * Ghép tham số vào URL dashboard. Trang web nhận cấu hình qua query chứ không qua file, để
 * hai khung nhìn trong cùng một cửa sổ (tab rộng, panel hẹp) khác nhau được, và để settings
 * của VSCode không đè lên cấu hình của app macOS / bản .exe đang dùng chung server.
 */
export function dashboardUrl(
  base: string,
  opts: {
    theme: 'dark' | 'light';
    refreshSeconds: number;
    compact: boolean;
    /** Loại agent hiện lúc mở lần đầu. Bỏ trống = để trang tự quyết. */
    aiKinds?: string[];
    /** Bộ nhân vật cho khung nhìn Văn phòng. Bỏ trống = để trang tự quyết. */
    officePack?: string;
    /** Bối cảnh của khung nhìn Văn phòng (office | farm | delivery). Bỏ trống = để trang
     *  tự quyết. Cùng luật với `officePack`: chỉ là giá trị khởi đầu. */
    officeScene?: string;
    /** `office` = chỉ vẽ căn phòng, bỏ hết header/tab/bảng chi tiết. Dùng cho cửa sổ nổi. */
    view?: 'office';
    /** Phiên bản của extension. Trang bày nó ở footer cạnh phiên bản server - hai số này
     *  lệch nhau được, vì extension mặc định dùng lại server đang chạy sẵn. */
    extVersion?: string;
  }
): string {
  const u = new URL(base);
  u.searchParams.set('theme', opts.theme);
  u.searchParams.set('refresh', String(opts.refreshSeconds));
  if (opts.compact) u.searchParams.set('compact', '1');
  if (opts.view) u.searchParams.set('view', opts.view);
  if (opts.extVersion) u.searchParams.set('ext', opts.extVersion);
  // Khác `theme`: đây chỉ là giá trị KHỞI ĐẦU. Lựa chọn người dùng bấm trên trang được lưu
  // lại và thắng tham số này ở lần mở sau - bấm tắt một loại xong tải lại mà nó hiện lại
  // thì cái nút coi như hỏng. `theme` phải thắng vì dashboard buộc bám màu của editor.
  if (opts.aiKinds && opts.aiKinds.length) u.searchParams.set('kinds', opts.aiKinds.join(','));
  if (opts.officePack) u.searchParams.set('pack', opts.officePack);
  if (opts.officeScene) u.searchParams.set('scene', opts.officeScene);
  return u.toString();
}
