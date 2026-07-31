/**
 * Quyết định nên ghi gì vào settings sau khi dò xong. Tách khỏi phần đọc/ghi thật vì file này
 * KHÔNG import `vscode` - nhờ vậy unit test nạp được thẳng bằng node.
 *
 * Vì sao phải tự điền: ba ô Python Path / Claude Data Dir / Pricing File để trống nghĩa là
 * "tự dò", nhưng người mở bảng Settings ra nhìn thấy ba ô trắng thì hiểu là tool chưa lấy
 * được dữ liệu. Điền sẵn giá trị đang thật sự dùng thì hết mơ hồ.
 *
 * Đổi lại, đường dẫn tuyệt đối có thể chết: Python được nâng cấp, hoặc `pricing.json` nằm
 * trong thư mục cài extension mà thư mục đó ĐỔI TÊN sau mỗi lần cập nhật extension. Vì vậy
 * phải phân biệt cho được ba tình huống, và đó là toàn bộ lý do file này tồn tại:
 *
 *   1. Ô trống vì chưa bao giờ điền  => điền vào.
 *   2. Ô trống vì người dùng tự xoá  => ĐỂ YÊN. Xoá đi là ý muốn quay lại chế độ tự dò,
 *                                       điền lại là cãi lại người dùng mỗi lần mở VSCode.
 *   3. Giá trị đang có nhưng đã chết  => của mình điền thì lặng lẽ thay; của người dùng tự gõ
 *                                       thì chỉ cảnh báo, không sửa đồ của người ta.
 */

export type SettingKey = 'pythonPath' | 'claudeDataDir' | 'pricingFile';

export const SETTING_KEYS: SettingKey[] = ['pythonPath', 'claudeDataDir', 'pricingFile'];

/** Giá trị extension đã tự điền lần trước, lưu ở globalState. Thiếu khoá = chưa từng điền. */
export type FilledRecord = Partial<Record<SettingKey, string>>;

export interface PlanInput {
  /** Giá trị đang có trong settings ('' là trống). */
  current: Record<SettingKey, string>;
  /** Giá trị dò được lúc này ('' là không dò ra gì). */
  detected: Record<SettingKey, string>;
  /** Giá trị đang có còn dùng được không (file/thư mục còn tồn tại, Python còn chạy). */
  valid: Record<SettingKey, boolean>;
  /** Những gì extension đã tự điền trước đây. */
  filled: FilledRecord;
}

export interface PlanWrite {
  key: SettingKey;
  value: string;
  /** `fill` là điền vào ô trống, `heal` là thay giá trị mình từng điền mà nay đã chết. */
  reason: 'fill' | 'heal';
}

export interface SettingsPlan {
  writes: PlanWrite[];
  /** Giá trị do người dùng tự đặt mà nay đã chết - chỉ báo, không tự sửa. */
  warn: SettingKey[];
}

export function planSettings(input: PlanInput): SettingsPlan {
  const writes: PlanWrite[] = [];
  const warn: SettingKey[] = [];

  for (const key of SETTING_KEYS) {
    const current = (input.current[key] ?? '').trim();
    const detected = (input.detected[key] ?? '').trim();
    const wasFilledByUs = Object.prototype.hasOwnProperty.call(input.filled, key);

    if (!current) {
      // Ô trống. Chỉ điền nếu chưa bao giờ điền - đã điền rồi mà nay trống nghĩa là người
      // dùng chủ động xoá để quay về chế độ tự dò.
      if (!wasFilledByUs && detected) writes.push({ key, value: detected, reason: 'fill' });
      continue;
    }

    if (input.valid[key]) continue;

    // Giá trị đã chết.
    if (wasFilledByUs && current === input.filled[key]) {
      // Của mình điền thì tự dọn: có cái mới thì thay, không thì trả về trống để tự dò lại.
      writes.push({ key, value: detected, reason: 'heal' });
    } else {
      warn.push(key);
    }
  }

  return { writes, warn };
}

/** Bản ghi mới sau khi đã ghi xong, để lần sau còn phân biệt "của mình" với "của người dùng". */
export function nextFilled(filled: FilledRecord, writes: PlanWrite[]): FilledRecord {
  const out: FilledRecord = { ...filled };
  for (const w of writes) {
    if (w.value) out[w.key] = w.value;
    else delete out[w.key];   // trả về trống thì coi như chưa từng điền, lần sau dò lại
  }
  return out;
}
