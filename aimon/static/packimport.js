/* Nhập bộ nhân vật từ ảnh của người dùng.
 *
 * Người dùng chọn một tấm ảnh nhiều nhân vật (kiểu bảng liên hoàn tải trên mạng), tool tự
 * tách nền, tự cắt thành từng nhân vật rồi đưa về đúng khuôn 16x20 mà khung nhìn Văn phòng
 * dùng. Ảnh KHÔNG rời khỏi máy: đọc bằng FileReader, xử lý bằng canvas, cất ở localStorage.
 * Không có lời gọi mạng nào trong file này, và bộ nhập được không bao giờ đi vào gói phát
 * hành - đó là điểm mấu chốt, vì ảnh người dùng tải về thường có giấy phép riêng hoặc là
 * fan art của nhân vật có chủ.
 *
 * Bốn bước, mỗi bước một cái bẫy riêng:
 *
 *   1. Tách nền  - flood fill từ MÉP vào, không phải lọc theo màu toàn ảnh.
 *   2. Cắt ô     - tách theo VÙNG LIÊN THÔNG, không chiếu hàng/cột (bố cục hay so le).
 *   3. Thu nhỏ   - lấy trung bình vùng rồi mới cắt ngưỡng alpha.
 *   4. Lọc rác   - bỏ vùng quá nhỏ HOẶC quá thưa (dấu chìm, chữ ký, bụi nén JPG).
 */

const IMPORT_MAX_CHARS = 40;     // một tấm nhiều hơn ngần này thì gần như chắc chắn cắt sai
const IMPORT_BG_TOL = 38;        // sai khác màu tối đa vẫn coi là nền (JPG nén nên phải nới)
const IMPORT_MIN_CELL = 6;       // ô nhỏ hơn ngần này pixel thì là bụi, không phải nhân vật
// Ngưỡng lọc rác, chọn theo số đo thật trên hai bảng đem thử (xem chú thích ở dropOutliers).
const IMPORT_MIN_REL_AREA = 0.08;   // nhỏ hơn 8% ô trung vị thì là mẩu vụn
const IMPORT_ASPECT_TOL = 2.2;      // lệch tỷ lệ ngang/dọc quá ngần này lần thì không phải nhân vật

/** Khoảng cách màu bình phương - khỏi tính căn, chỉ cần so sánh tương đối. */
function colorDist2(d, i, r, g, b) {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Xoá nền bằng flood fill từ mép ảnh vào.
 *
 * Vì sao không lọc theo màu trên toàn ảnh: nhân vật áo trắng trên nền trắng sẽ bị thủng
 * một lỗ giữa người. Đi từ mép vào thì chỉ những vùng NỐI RA ĐƯỢC MÉP mới bị coi là nền,
 * còn màu trắng nằm lọt trong thân vẫn giữ nguyên.
 */
function stripBackground(img, tol) {
  const w = img.width, h = img.height;
  const d = img.data;
  const seen = new Uint8Array(w * h);
  const stack = [];

  // Màu nền lấy ở bốn góc rồi chọn màu xuất hiện nhiều nhất - góc là chỗ chắc chắn không
  // có nhân vật. Ảnh nào có sẵn kênh alpha thì bỏ qua hết bước này.
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  if (corners.every((i) => d[i + 3] < 250)) return;   // đã trong suốt sẵn

  const tally = new Map();
  corners.forEach((i) => {
    const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  });
  let best = '', bestN = -1;
  tally.forEach((n, key) => { if (n > bestN) { bestN = n; best = key; } });
  const [br, bg, bb] = best.split(',').map(Number);

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    if (colorDist2(d, p * 4, br, bg, bb) > tol * tol) return;
    seen[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (stack.length) {
    const p = stack.pop();
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
}

/**
 * Gán nhãn từng vùng liên thông rồi lấy khung bao của mỗi vùng.
 *
 * Vì sao không chiếu xuống hàng/cột để tìm khe trống: bảng liên hoàn thật gần như không bao
 * giờ xếp thành lưới đều. Ảnh thú trại đem thử có hàng 4 con so le nhau, chiếu xuống cột thì
 * không có cột nào trống hẳn nên cả 4 con bị gộp thành MỘT ô, thu lại còn một mớ tí hon.
 * Mỗi nhân vật là một vùng liên thông, nên tách theo vùng là đúng bản chất bài toán.
 */
function findBlobs(d, w, h) {
  const seen = new Uint8Array(w * h);
  const boxes = [];
  const stack = [];

  for (let p0 = 0; p0 < w * h; p0++) {
    if (seen[p0] || d[p0 * 4 + 3] <= 128) continue;
    seen[p0] = 1;
    stack.push(p0);
    let minX = w, maxX = -1, minY = h, maxY = -1, area = 0;

    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 8 hướng: nét chéo 1 pixel của pixel art hay chỉ chạm nhau ở góc, dùng 4 hướng thì
      // một nhân vật bị vỡ thành mấy mảnh rời.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (seen[q] || d[q * 4 + 3] <= 128) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }
  return boxes;
}

/** Khoảng cách giữa hai khung theo trục xa nhất. 0 nếu chúng chồng lên nhau. */
function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.max(dx, dy);
}

/**
 * Gắn những mẩu lẻ vào nhân vật gần nhất.
 *
 * Một nhân vật hay bị vỡ thành vài vùng rời: cái mũ tách khỏi đầu, con mắt nằm lọt trong
 * mảng màu khác, cái tai hở một pixel. Nhưng KHÔNG được gộp bừa theo khoảng cách: bản đầu
 * nới theo kích thước ẢNH (1.2% cạnh ngắn) nên với tấm 1200px thành 14 pixel, và hai con
 * vật đứng cạnh nhau bị dính làm một - 11 con thu lại còn 4.
 *
 * Nên phân loại trước: khung nào cỡ trung bình trở lên là một nhân vật thật, khung tí hon
 * mới là mẩu lẻ. Mẩu lẻ tìm nhân vật gần nhất mà nhập vào; nhân vật thật không bao giờ nhập
 * vào nhau, dù đứng sát đến đâu.
 */
function attachOrphans(boxes) {
  if (boxes.length < 2) return boxes;
  const areas = boxes.map((b) => b.w * b.h).sort((x, y) => x - y);
  const median = areas[areas.length >> 1];

  const main = boxes.filter((b) => b.w * b.h >= median * 0.3);
  const bits = boxes.filter((b) => b.w * b.h < median * 0.3);
  if (!main.length) return boxes;

  bits.forEach((bit) => {
    let best = null, bestGap = Infinity;
    main.forEach((m) => {
      // Ngưỡng theo kích thước CỦA CHÍNH nhân vật đó, không theo kích thước ảnh.
      const reach = Math.max(2, Math.round(Math.max(m.w, m.h) * 0.15));
      const gap = boxGap(m, bit);
      if (gap <= reach && gap < bestGap) { bestGap = gap; best = m; }
    });
    if (!best) return;      // mẩu lẻ không thuộc về ai: bụi nén, dấu chìm - bỏ luôn
    const x = Math.min(best.x, bit.x), y = Math.min(best.y, bit.y);
    best.w = Math.max(best.x + best.w, bit.x + bit.w) - x;
    best.h = Math.max(best.y + best.h, bit.y + bit.h) - y;
    best.x = x;
    best.y = y;
  });
  return main;
}

/**
 * Bỏ những khung không giống phần còn lại - gần như luôn là dấu chìm, chữ ký, hay mẩu vụn.
 *
 * Chọn dấu hiệu theo SỐ ĐO THẬT trên hai bảng đem thử, không đoán:
 *
 *   ảnh thú trại  12 nhân vật, tỷ lệ ngang/dọc 0.99 - 1.47, ô nhỏ nhất bằng 41% ô trung vị
 *   ảnh mascot    20 nhân vật, tỷ lệ 0.69 - 0.99
 *                 + dấu chìm "ShowHex": tỷ lệ 3.72  <- lệch hẳn
 *                 + hai mẩu vụn 8x7 và 6x6: diện tích ~0% ô trung vị
 *
 * Nên hai luật là đủ và không đụng vào nhân vật thật. Lọc theo độ ĐẶC thì không được: chữ
 * "ShowHex" đặc tới 0.91, đặc hơn cả nửa số nhân vật.
 */
function dropOutliers(boxes) {
  if (boxes.length < 3) return boxes;   // quá ít mẫu thì trung vị vô nghĩa, đừng đoán bừa
  const mid = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
  const medArea = mid(boxes.map((b) => b.w * b.h));
  const medAspect = mid(boxes.map((b) => b.w / b.h));
  return boxes.filter((b) => {
    if ((b.w * b.h) / medArea < IMPORT_MIN_REL_AREA) return false;
    const asp = (b.w / b.h) / medAspect;
    return asp <= IMPORT_ASPECT_TOL && asp >= 1 / IMPORT_ASPECT_TOL;
  });
}

/**
 * Thu một ô về khuôn 16x20.
 *
 * Bật làm mượt khi thu nhỏ (lấy trung bình vùng) rồi mới cắt ngưỡng alpha. Dùng thẳng
 * nearest-neighbour để thu từ 120px xuống 16px thì mỗi pixel đích chỉ lấy đúng một pixel
 * nguồn, mất gần hết chi tiết và màu nhảy loạn. Cắt ngưỡng sau đó để mép vẫn sắc, không bị
 * viền mờ nửa trong suốt.
 */
function fitCell(src, box, dw, dh) {
  const scale = Math.min(dw / box.w, dh / box.h);
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));

  const cv = document.createElement('canvas');
  cv.width = dw;
  cv.height = dh;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // Căn giữa ngang, căn ĐÁY dọc: nhân vật phải đứng trên sàn, căn giữa dọc thì người thấp
  // trông như đang lơ lửng.
  g.drawImage(src, box.x, box.y, box.w, box.h, Math.floor((dw - w) / 2), dh - h, w, h);

  const img = g.getImageData(0, 0, dw, dh);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 128 ? 255 : 0;
  g.putImageData(img, 0, 0);
  return cv;
}

/**
 * Cắt một tấm ảnh thành danh sách canvas 16x20.
 *
 * Trả về `{ cells, note }` - `note` là mã i18n giải thích khi kết quả đáng ngờ, để giao diện
 * nói cho người dùng biết thay vì lặng lẽ đưa ra một bộ hỏng.
 */
function sliceSheet(image, cellW, cellH) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!w || !h) return { cells: [], note: 'import.err_empty' };

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);

  const img = g.getImageData(0, 0, w, h);
  stripBackground(img, IMPORT_BG_TOL);
  g.putImageData(img, 0, 0);
  const d = img.data;

  let boxes = findBlobs(d, w, h).filter((b) => b.w >= 2 && b.h >= 2);
  if (!boxes.length) return { cells: [], note: 'import.err_empty' };

  const keep = dropOutliers(
    attachOrphans(boxes).filter((b) => b.w >= IMPORT_MIN_CELL && b.h >= IMPORT_MIN_CELL)
  );
  if (!keep.length) return { cells: [], note: 'import.err_empty' };

  // Trên xuống dưới, trái sang phải - thứ tự người ta đọc, để bộ nhập vào không xáo trộn.
  // Coi là "cùng hàng" khi lệch dọc chưa tới nửa chiều cao nhân vật: bảng liên hoàn hay xếp
  // so le, so y tuyệt đối thì thứ tự nhảy loạn.
  const rowTol = keep.reduce((m, b) => m + b.h, 0) / keep.length * 0.5;
  keep.sort((a, b) => (Math.abs(a.y - b.y) > rowTol ? a.y - b.y : a.x - b.x));

  const cells = keep.slice(0, IMPORT_MAX_CHARS).map((b) => fitCell(cv, b, cellW, cellH));
  let note = '';
  if (keep.length > IMPORT_MAX_CHARS) note = 'import.note_trimmed';
  else if (cells.length === 1) note = 'import.note_single';
  return { cells, note, found: keep.length };
}

/** Đọc một File thành Image. Tách riêng để phần cắt ở trên test được mà không cần DOM file. */
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('read'));
    fr.onload = () => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('decode'));
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
