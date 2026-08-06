# Thanh trạng thái: gộp 4 số vào text taskbar

## Vấn đề

`aimon.statusBar.metric` hiện chỉ hiện được MỘT trong bốn: `both` (session%+weekly%),
`session`, `weekly`, `cost`. Người dùng muốn thấy cả 4 số cùng lúc mà không cần hover:
session (5h), weekly (7 ngày), token API hôm nay, chi phí hôm nay.

## Thay đổi

### `vscode-extension/src/usage.ts` (thuần, không import `vscode`)

- `UsageSummary` thêm field `todayTokens: number | null`, lấy từ
  `snapshot.totals?.today?.total` trong `summarize()`. Field đã có sẵn ở `/api/snapshot`
  (`aimon/collectors/claude.py::_window` gán `agg["total"]`), không cần đổi backend.
- Hàm mới `fmtTokens(n: number | null): string`:
  - `null` → `"--"`
  - `< 1000` → số nguyên (`"420"`)
  - `< 1_000_000` → `"{n/1000 làm tròn 1 chữ số thập phân, bỏ .0}K"` (128000 → `"128K"`,
    999500 → `"999.5K"`... nhưng làm tròn K nguyên nếu chia hết, vd 128000 → "128K" không
    "128.0K")
  - `>= 1_000_000` → tương tự với hậu tố `M` (1250000 → `"1.2M"`)
- `StatusMetric` thêm giá trị `'all'`.
- `statusText()` thêm case `'all'`:
  `` `$(pulse) ${mark}5h ${pctText(session)} · 7d ${pctText(weekly)} · ${fmtTokens(tokens)} tok · $${cost.toFixed(2)}` ``
  (giữ nguyên cách các case khác dùng `mark` cho phần ước lượng, chỉ gắn trước hai số %,
  không gắn trước token/cost vì hai số đó không phải ước lượng từ nguồn official/estimate).

### `vscode-extension/src/statusBar.ts`

- Tooltip (`render()`) thêm dòng "Token hôm nay: {fmtTokens}" xen giữa dòng Weekly và dòng
  Chi phí hôm nay đã có.

### `vscode-extension/package.json`

- `aimon.statusBar.metric.enum` thêm `"all"` ở đầu danh sách, `enumDescriptions` tương ứng:
  "Session, Weekly, today's tokens and cost — all four".
- `default` đổi từ `"both"` → `"all"`. Đây là default mới cho MỌI người chưa từng chỉnh tay
  setting này (đa số). Ai đã set tường minh `both`/`session`/`weekly`/`cost` trong settings
  của họ không bị ảnh hưởng — VSCode chỉ áp default khi key vắng mặt trong settings.json.

## Không đổi

- Backend (`aimon/`), `/api/snapshot` payload.
- `severityOf()` — màu nền cảnh báo vẫn chỉ dựa session/weekly %, không dựa token/cost.
- Nhịp poll thanh trạng thái.
- 4 giá trị `both`/`session`/`weekly`/`cost` cũ vẫn giữ nguyên hành vi, chỉ thêm `all`.

## Test

Thêm vào `vscode-extension/test/usage.test.ts`:
- `fmtTokens`: `null`→`"--"`, `420`→`"420"`, `128000`→`"128K"`, `1250000`→`"1.2M"`.
- `summarize` đọc được `todayTokens` từ snapshot có `totals.today.total`, và trả `null` khi
  thiếu field (snapshot rỗng/cũ).
- `statusText(u, 'all')` ra đúng chuỗi ghép 4 số, kể cả khi `u` thiếu `todayTokens` (hiện
  `"--"` thay vì lỗi).
