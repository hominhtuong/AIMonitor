# Nhóm khung cảnh - nghiên cứu và kế hoạch thi công

Hôm nay khung nhìn Văn phòng chỉ có một bối cảnh duy nhất: căn phòng làm việc, mười cái bàn,
ai bận thì ngồi gõ phím. Tài liệu này trả lời ba câu:

1. Có dựng thêm được nhiều **nhóm bối cảnh** không (nông trại, giao hàng, bếp...), mỗi nhóm có
   hình học riêng, hành vi riêng, nền riêng?
2. Nếu mỗi agent phải **diễn đúng vai theo việc đang làm** (tiều phu bổ củi, nông dân dắt trâu
   đi cày, người thu hoạch) thì cơ chế nào giữ được mà không rối?
3. Làm sao vừa **thêm hình vừa không tốn thêm máy** - nạp khi cần, không dùng thì trả lại,
   giữ nét mà không ăn CPU?

Đây là tài liệu **nghiên cứu, chưa thi công**. Trích dẫn code lấy ở bản 2.0.1. Số đo lấy từ
[docs/hieu-nang.md](hieu-nang.md); chỗ nào là ước lượng đếm từ code thì có ghi rõ.

---

## Trạng thái thi công

**Đã làm xong** (08/2026). Ba bối cảnh chạy thật: Văn phòng, Nông trại, Giao hàng. Tài liệu
này giữ nguyên phần nghiên cứu vì nó vẫn là chỗ giải thích VÌ SAO kiến trúc ra như vậy; phần
nào khi làm thật đi khác thiết kế thì có ghi rõ ở [Phần VI](#phần-vi---kế-hoạch-thi-công).

| Việc | Trạng thái |
| --- | --- |
| Ba tối ưu độc lập (thả atlas, hoãn ô xem trước, nướng nền) | xong |
| Lớp SCENE, Văn phòng thành `SCENES[0]` | xong, không đổi một pixel nào |
| Bối cảnh Nông trại | xong - 9 vai diễn, cây lớn theo tiến độ, gà + chó |
| Bối cảnh Giao hàng | xong - vòng chạy xe kho <=> địa chỉ, chồng thùng theo số tool |
| Plumbing (i18n, config, settings VSCode, CI) | xong |
| Nạp code bối cảnh theo yêu cầu (giai đoạn 5) | xong - chỉ dùng Văn phòng thì không tải byte nào |
| Bối cảnh thứ tư (Bếp / Công trường) | **chưa** - xem Phần V |

## Mục lục

- [Kết luận ngắn](#kết-luận-ngắn)
- [Phần I - Hiện trạng](#phần-i---hiện-trạng)
- [Phần II - Kiến trúc lớp SCENE](#phần-ii---kiến-trúc-lớp-scene)
- [Phần III - Vai diễn theo việc đang làm](#phần-iii---vai-diễn-theo-việc-đang-làm)
- [Phần IV - Hiệu năng: bảy cơ chế](#phần-iv---hiệu-năng-bảy-cơ-chế)
- [Phần V - Danh mục bối cảnh](#phần-v---danh-mục-bối-cảnh)
- [Phần VI - Kế hoạch thi công](#phần-vi---kế-hoạch-thi-công)
- [Phần VII - Danh sách phải khớp và CI](#phần-vii---danh-sách-phải-khớp-và-ci)
- [Phần VIII - Sổ rủi ro](#phần-viii---sổ-rủi-ro)
- [Phần IX - Câu hỏi còn mở](#phần-ix---câu-hỏi-còn-mở)

---

## Kết luận ngắn

Làm được, không phải đụng gì tới backend, và **rẻ hơn nhiều so với cảm giác ban đầu** - với
điều kiện giữ đúng ba quyết định gốc:

1. **Không vẽ khung hình mới cho nhân vật.** Giữ nguyên 13 khung đang có, cái khác biệt đến từ
   **đạo cụ** vẽ ở lớp scene. Nếu không, mỗi bối cảnh mới tốn 8 bộ x 4 khung = 32 hàm vẽ pixel,
   và bộ người dùng tự nhập từ ảnh thì vĩnh viễn không dùng được bối cảnh mới.
2. **Mỗi agent vẫn sở hữu đúng MỘT chỗ cố định.** Vai diễn đổi theo việc, chỗ ở thì không. Mất
   điều này là mất luôn khả năng "nhìn vào biết ai là ai" - thứ mà cả tab này tồn tại vì nó.
3. **Nền tĩnh nướng một lần vào canvas rời.** Hiện mỗi khung hình vẽ lại khoảng 350 lệnh
   `fillRect` chỉ riêng phần sàn và tường. Nông trại có cỏ, hàng rào, cây cối sẽ gấp ba con số
   đó. Nướng sẵn ở pixel gốc rồi dán bằng một `drawImage` là xong, và vì bậc phóng luôn là số
   nguyên nên **không mất một chút nét nào**.

Ngoài ra tìm được ba chỗ tối ưu đang bỏ ngỏ ngay trong bản hiện tại, không liên quan tới việc
thêm bối cảnh, nêu ở [Phần IV](#phần-iv---hiệu-năng-bảy-cơ-chế).

---

## Phần I - Hiện trạng

### I.1 Ba trục, và vì sao trục thứ ba khác hẳn

| Trục | Khai ở đâu | Đổi được gì | Vì sao rẻ |
| --- | --- | --- | --- |
| Bộ nhân vật (8 bộ, 127 nhân vật) | `sprites.js` `BUILTIN_PACKS` | hình nhân vật | mọi bộ vẽ đúng 13 khung giống nhau (`FRAMES`) |
| Kiểu phòng (4 kiểu) | `office.js` `ROOMS` | sàn, tường, trang trí | có hợp đồng cứng: không kiểu nào được đụng vào hình học |
| **Nhóm bối cảnh** | chưa có | hình học, luật đi, hành vi, đạo cụ, sinh vật nền | đúng những thứ hai trục kia bị cấm đụng |

Thêm một bộ nhân vật = thêm một dòng vào mảng cộng một hàm vẽ. Thêm một kiểu phòng = thêm một
dòng vào mảng cộng một hàm vẽ nền. Thêm một **nhóm bối cảnh** thì không, vì hình học phòng và
luật đi lại đang là hằng số toàn cục của module.

### I.2 Chín chỗ đang khoá cứng vào văn phòng

| Chỗ | Khoá cái gì | Phải thành |
| --- | --- | --- |
| đầu `office.js` | `ROW_Y`, `AISLE_Y`, `CORRIDOR_X`, `DESK_X` | dữ liệu của scene |
| `buildDesks()` | 10 chỗ làm việc = 2 dãy x 5 bàn | `scene.stations()` |
| `routeTo()` | bước ngang khỏi ghế => xuống lối đi => vòng lối dọc | `scene.route()` |
| `step()` | máy trạng thái ngồi bàn / đi vòng vòng / ăn mừng / ra cửa | phần chung ở lõi, phần riêng vào `scene.behave()` |
| `drawDesk()` + `drawChairBase/Back` | bàn, màn hình, bàn phím, ghế hai lớp | `scene.drawStation()` + `scene.drawAfter()` |
| `drawRoom()` | thảm và cửa dùng chung cho mọi kiểu phòng | `scene.drawCommon()` |
| `draw()` | thứ tự vẽ theo hai dãy bàn | `scene.bands()` |
| `deskAt()` | vùng bấm theo cụm bàn | `scene.stationAt()` |
| `paintRoomPreview()` | ô xem trước tự vẽ thêm mấy cái bàn vào | `scene.drawPreviewExtras()` |

Ngược lại, chừng 60% file **không** phải đụng tới: atlas, `newEntity`, `queueEvents`,
`currentAction`, confetti và màn ăn mừng, `leaving` cộng `LEAVE_TIMEOUT`, `setHover` /
`greet` / `glance`, `frameSig`, `resize`, bảng chi tiết, thanh lọc loại agent. Đó cũng đúng là
chỗ tập trung gần hết những cái bẫy đã trả giá ghi trong CLAUDE.md - tin tốt, vì nghĩa là refactor
không cần chạm vào chúng.

### I.3 Số đo làm mốc

Từ [docs/hieu-nang.md](hieu-nang.md), đo trên Apple M2 16 GB:

| Hạng mục | Giá trị hiện tại |
| --- | --- |
| Atlas bộ mặc định (Hải trình, 36 nhân vật) | 756 x 2442 px, **7.0 MB**, nướng **60 ms** |
| Atlas bộ 10 nhân vật | 756 x 726 px, **2.1 MB**, nướng **19 ms** |
| Đỉnh nhất thời lúc nướng (có `ImageData` tạm) | gấp đôi, **14 MB** với bộ mặc định |
| Phòng đứng yên | **5 fps** (nhờ `frameSig`) |
| Phòng có người đi lại | 53-60 fps |
| CPU tab Văn phòng đang mở, có người đi lại | 5.56% server + 4.4% renderer |
| `/api/pulse` | 4 ms, 6.8 KB (2.6 KB đã nén), nhịp 1 giây |
| `office.js` gửi xuống trình duyệt | 72.2 KB, gzip **26.3 KB** |

Ước lượng đếm từ code (chưa bấm đồng hồ): một khung hình của kiểu phòng Cổ điển tốn khoảng
**350 lệnh `fillRect` cho riêng phần nền** (sàn ô cờ 8 pixel trên vùng 260x150 đã là ~320 lệnh),
cộng khoảng 210 lệnh nữa cho 10 bàn và ghế. Tổng chừng **560 lệnh vẽ mỗi khung**.

---

## Phần II - Kiến trúc lớp SCENE

### II.1 Hợp đồng

```js
const SCENES = [
  {
    id: 'office',
    defaultPack: 'voyage',
    defaultRoom: 'classic',
    rooms: [ /* các kiểu nền của riêng bối cảnh này */ ],

    // --- hình học ---
    stations(),               // >= MAX_AGENTS chỗ, mỗi chỗ có id ổn định
    lanes(),                  // các lối đi hợp lệ, dùng cho route() và wander()
    entry(), exit(),          // điểm vào và ra khỏi khung hình
    landmarks(),              // điểm đến dùng chung: giếng nước, kho, chợ...

    // --- luật đi ---
    route(e, tx, ty, station),// dựng path, chèn các chặng vòng tránh vật cản
    wanderTarget(e),          // đích khi rảnh

    // --- hành vi ---
    roleOf(action, e),        // vai diễn ứng với việc đang làm (Phần III)
    behave(e, dt, d),         // phần RIÊNG của step()
    onArrive(e),              // vừa tới đích thì đổi mode thế nào

    // --- vẽ ---
    drawStatic(g, p, roomId), // nền tĩnh, nướng MỘT LẦN vào canvas rời
    drawAnimated(g, p),       // phần nền có chuyển động (đồng hồ, đèn giao thông)
    drawStation(g, st, ent),  // vẽ trước nhân vật
    drawAfter(g, st, ent),    // vẽ sau nhân vật (tựa ghế, ghi đông xe)
    drawProp(g, e, frame),    // đạo cụ trong tay hoặc dưới chân nhân vật
    bands(),                  // dải chiều sâu để xếp thứ tự vẽ
    props(),                  // danh sách ô đạo cụ cần nướng vào prop atlas

    // --- tương tác ---
    stationAt(x, y),          // vùng bấm

    // --- sinh vật nền ---
    ambient(),                // gà, chó, mèo, chim... (Phần III.4)

    // --- ngân sách ---
    budget: { drawOps: 600, ambient: 6, propCells: 40 },
  },
];
```

### II.2 Sáu bất biến bắt buộc

Đây là phần quan trọng nhất của kiến trúc. Mỗi dòng dưới đây là một cái bẫy đã trả giá ở bản
office, viết lại thành luật chung cho mọi scene.

| # | Bất biến | Vì sao |
| --- | --- | --- |
| 1 | `ROOM_W` / `ROOM_H` dùng chung cho MỌI scene | giữ nguyên `resize()`, bậc phóng, `spriteSmooth`, ô xem trước, hit test, và cho phép nướng nền ở pixel gốc |
| 2 | Mọi scene có >= `MAX_AGENTS` = 10 chỗ | `office.py` không phải đổi, invariant "số chỗ khớp MAX_AGENTS" vẫn là một dòng assert trong CI |
| 3 | Mỗi agent sở hữu đúng MỘT chỗ, ổn định suốt phiên | nhận ra ai là ai; đảo chỗ mỗi nhịp là cả màn hình nhốn nháo |
| 4 | Chỗ chỉ được nhả khi agent đã ra khỏi khung hình | người đang ăn mừng vẫn giữ chỗ, nếu không người mới vào ngồi đè lên |
| 5 | `scene.behave()` KHÔNG được đụng vào `path` / `goal` / `mode` của người đang `leaving` | đây đúng là gốc rễ của lỗi nhân vật ma |
| 6 | Mọi trạng thái ảnh hưởng tới hình phải có mặt trong `frameSig()` | thiếu thì màn hình đứng hình, thừa thì mất tối ưu 5 fps |

### II.3 Quan hệ scene, nền và bộ nhân vật

```text
scene (office | farm | delivery | ...)
 ├── rooms[]        nền riêng của scene đó, 3-4 kiểu
 ├── defaultPack    bộ gợi ý, KHÔNG bắt buộc
 └── props[]        đạo cụ riêng, nướng vào prop atlas riêng

pack (8 bộ dựng sẵn + bộ nhập tay)  ---  dùng được ở MỌI scene
```

Đây là chỗ nên làm khác ý ban đầu một chút. Khoá cứng bộ nhân vật theo bối cảnh sẽ:

- nhân số việc vẽ nhân vật lên bằng số bối cảnh;
- **loại bỏ hẳn bộ người dùng tự nhập** khỏi mọi bối cảnh mới, mà đó lại là tính năng người
  dùng đã bỏ công đưa ảnh của mình vào.

Cái cảm giác "cả nhóm ăn nhập với nhau" lấy bằng hai thứ rẻ hơn nhiều:

1. `defaultPack` - lần đầu chuyển sang nông trại thì tự chọn bộ hợp cảnh, người dùng vẫn đổi
   được.
2. **Phụ kiện theo scene** vẽ đè lên nhân vật ở lớp scene: nón lá cho nông trại, mũ bảo hiểm
   cho shipper, mũ đầu bếp cho bếp. Một hàm chừng 10 dòng, chạy cho cả 127 nhân vật dựng sẵn
   lẫn bộ nhập tay, không tốn thêm một hàng atlas nào.

---

## Phần III - Vai diễn theo việc đang làm

Đây là phần đổi nhiều nhất so với bản office, và là thứ làm nông trại sống động.

### III.1 Vấn đề

Ở office, mọi agent làm cùng một động tác (ngồi gõ phím) và cái duy nhất nói lên "đang làm gì"
là **màu màn hình**. Ở nông trại thì việc gì phải ra việc đó: người bổ củi cầm rìu, người cày
ruộng dắt trâu, người thu hoạch vác bó lúa.

Backend đã trả sẵn 9 mã hoạt cảnh ở `office.py` - `type`, `read`, `run`, `web`, `delegate`,
`plan`, `mcp`, `work`, `rest`. Chúng nói về **tool đang chạy**, không nói gì về văn phòng, nên
mỗi scene chỉ việc diễn giải lại. **Không cần sửa server một dòng nào.**

### III.2 Hai tầng vai diễn

| Tầng | Diễn ở đâu | Ai được | Ràng buộc |
| --- | --- | --- | --- |
| **A - tại chỗ** | ngay tại chỗ của mình | mặc định cho mọi vai | không đi đâu, chỉ đổi đạo cụ và hoạt hoạ |
| **B - đi một chuyến** | tới một `landmark` dùng chung rồi quay về | chỉ 2-3 vai | tối đa 1 chuyến cùng lúc mỗi người, landmark có số chỗ giới hạn |

Tầng B là thứ làm khung hình có dòng chảy (có người đang đi lại giữa các khu), tầng A giữ cho
nó không loạn. Tỷ lệ nên là 6-7 vai tầng A trên 2-3 vai tầng B.

### III.3 Chống nhấp nháy - luật đổi vai

Agent đổi tool liên tục, có khi hai lần trong một giây. Đổi vai theo từng tool là cả nông trại
co giật. Ba lớp chặn:

| Lớp | Luật | Trị số đề xuất |
| --- | --- | --- |
| 1. Giữ vai | Chỉ đổi vai khi mã hoạt cảnh mới giữ nguyên qua ít nhất `ROLE_HOLD` | 2.5 giây (2-3 nhịp `/api/pulse`) |
| 2. Trọn chu kỳ | Vai hiện tại phải diễn xong ít nhất một chu kỳ hoạt hoạ rồi mới được cắt | ~1 giây |
| 3. Ngưỡng đi chuyến | Vai tầng B chỉ khởi động khi mã hoạt cảnh giữ >= `TRIP_HOLD` | 4 giây (đi bộ mất ~3 giây) |

Hàng đợi sự kiện `queueEvents` / `BURST_SEC` hiện có vẫn giữ nguyên vai trò cũ: nó lo mấy tool
chớp nhoáng bị poll bỏ lọt, và ở scene mới nó chỉ đổi **đạo cụ trong tay**, không đổi vai.

### III.4 Sinh vật nền

Hiện có đúng một con mèo (`stepCat`, dải `CAT_LANE` sát mép dưới). Tổng quát hoá thành
`scene.ambient()`: một danh sách sinh vật nhỏ, mỗi con có dải hoạt động riêng, dùng chung một
máy trạng thái "đi tới đích rồi đứng chờ" cực đơn giản.

| Bối cảnh | Sinh vật nền |
| --- | --- |
| Văn phòng | mèo (đang có) |
| Nông trại | 4 gà mổ thóc, 1 chó chạy theo người, 2 vịt ở ao góc, bướm |
| Shipper | chó chạy theo xe, chim đậu dây điện, xe khác chạy ngang (không phải agent) |
| Bếp | mèo nằm cửa sau, hơi nước bốc lên |

Bài học từ con mèo phải nhớ: **`stepCat()` từng cộng `anim` vô điều kiện, nên con mèo nằm chờ
vẫn đảo hai khung đi bộ 5 lần mỗi giây, và vì thế cả căn phòng đứng yên vẫn phải vẽ lại 5 lần
mỗi giây chỉ vì nó.** Với 7 sinh vật nền thay vì 1, sai lầm này sẽ đưa tab về thẳng 60 fps
vĩnh viễn. Cách chặn ở [Phần IV.6](#iv6-sinh-vật-nền-chạy-ở-nhịp-thấp).

### III.5 Bảng vai của nông trại

Layout: giữ nguyên lưới 2 hàng x 5 chỗ của office (rủi ro thấp nhất), mỗi chỗ là một **thửa
ruộng** kèm một đống củi nhỏ ở mép. Trên cùng thay bức tường bằng dải rừng và hàng rào. Dưới
cùng là con đường đất. Landmark: **giếng nước** (trái), **kho thóc** (phải), **chòi canh**
(giữa trên), **xe hàng rong** (dưới phải).

| Mã | Tool nguồn | Vai diễn | Tầng | Đạo cụ | Dấu trên thửa |
| --- | --- | --- | --- | --- | --- |
| `type` | Edit, Write | nông dân dắt trâu đi cày | A | trâu + cày | cỏ => luống cày |
| `read` | Read, Grep, Glob | thu hoạch, cắt lúa | A | liềm + bó lúa | lúa vàng => gốc rạ |
| `run` | Bash | tiều phu bổ củi | A | rìu | đống củi cao dần |
| `web` | WebFetch, WebSearch | gánh nước từ giếng | **B** | đòn gánh + đôi thùng | luống ướt sẫm màu |
| `delegate` | Task | gọi thêm người làm | A | vẫy tay | 1-2 người phụ hiện ra cạnh thửa |
| `plan` | TodoWrite | xem bản đồ đồng ruộng | **B** | cuộn giấy | cắm cọc đánh dấu |
| `mcp` | `mcp__*` | đổi hàng ở xe hàng rong | **B** | thùng hàng | - |
| `work` | tool lạ | cuốc đất | A | cuốc | - |
| `rest` | - | ngồi bờ ruộng quạt nón | A | nón lá | - |

Ba chi tiết làm nó "đọc được" từ xa:

- **Thửa ruộng có tiến độ `growth` 0..1**, tăng theo thời gian agent thật sự bận trên đó. Đất
  trống => mầm => lúa non => lúa vàng. Đây là bản nông trại của cái màn hình sáng ở office:
  liếc cả khung hình là biết ai đang làm lâu, ai vừa vào.
- **Ăn mừng lúc xong việc = gặt.** Bó lúa bay lên thay confetti, con chó chạy tới nhảy quanh.
  Giữ nguyên `CHEER_SEC` = 2 giây và luật "ăn mừng ngay tại chỗ CỦA MÌNH".
- **Sub-agent thành người làm công**, đứng ở đúng hai vị trí `helpers` cạnh thửa của người gọi
  nó, y như bản office - nhìn là biết của ai.

### III.6 Bảng vai của shipper

Layout: khác office hẳn, và đó là chủ ý - nó là bài kiểm tra thật cho kiến trúc.

```text
 ┌──────────────────────────────────────────────┐
 │  nhà 1   nhà 2   nhà 3   nhà 4   nhà 5       │  <- 5 địa chỉ hàng trên
 │  ────────────── vỉa hè trên ──────────────   │
 │ ┌────┐                                       │
 │ │KHO │  ══════ đường, 2 làn ══════════════   │  <- làn đi và làn về
 │ └────┘                                       │
 │  ────────────── vỉa hè dưới ──────────────   │
 │  nhà 6   nhà 7   nhà 8   nhà 9   nhà 10      │  <- 5 địa chỉ hàng dưới
 └──────────────────────────────────────────────┘
```

Mỗi agent sở hữu **một địa chỉ** (bất biến số 3 vẫn giữ). Kho là landmark dùng chung.

| Mã | Vai diễn | Tầng | Diễn thế nào |
| --- | --- | --- | --- |
| `type` | đóng gói ở kho | B | về kho, dán băng keo lên thùng |
| `read` | dò bản đồ, quét mã | A | dừng xe bên đường, cầm điện thoại |
| `run` | chạy giao hàng | B | phóng xe từ kho tới địa chỉ của mình rồi quay về |
| `web` | tra cứu tuyến | A | đứng cạnh xe, bong bóng bản đồ |
| `delegate` | gọi shipper phụ | A | sub-agent hiện ra trên một xe thứ hai chạy theo sau |
| `plan` | xếp đơn | B | ở kho, chồng thùng lên nhau |
| `mcp` | ghé trạm đối tác | B | tạt vào ki-ốt giữa đường |
| `work` | chạy tuần đường | A | đi tới đi lui trên làn của mình |
| `rest` | đỗ xe, ngồi lên yên xem điện thoại | A | ở địa chỉ của mình |

Ba điểm đắt giá của bối cảnh này:

- **Số thùng hàng chồng sau xe = số tool đang chạy.** Payload đã có sẵn `pending_more`, chỉ
  việc đọc: 1 thùng là bận vừa, 4 thùng chồng lên nhau là đang chạy hết công suất. Trực quan
  hơn hẳn một con số.
- **Cách vẽ người ngồi trên xe mà không cần khung hình mới:** vẽ bánh và thân xe trước, rồi vẽ
  nhân vật bằng khung đi ngang `s0/s1/s2` nhưng **cắt bớt 4 hàng chân** (truyền chiều cao
  nguồn ngắn hơn cho `drawImage`), rồi vẽ ghi đông và thùng hàng đè lên. Chân khuất sau thân
  xe, đúng như ngồi thật. Xe nhún theo nhịp bước có sẵn thành ra dáng đường xóc.
- **Cảnh báo hiệu năng:** bối cảnh này làm `frameSig()` gần như không bao giờ trùng, nên nó
  chạy đủ 60 fps thay vì tụt về 5 fps như phòng đứng yên. Đo được 0.11 ms một khung nên vẫn
  ổn, nhưng phải biết trước, và phải giữ ngân sách vẽ ở [Phần IV.7](#iv7-ngân-sách-hiệu-năng-cho-mỗi-bối-cảnh).

---

## Phần IV - Hiệu năng: bảy cơ chế

Ba cơ chế đầu là **tối ưu đang bỏ ngỏ ngay trong bản hiện tại**, làm được ngay cả khi không
thêm bối cảnh nào. Bốn cơ chế sau là điều kiện để thêm bối cảnh mà không đắt thêm.

### IV.1 Giải phóng atlas khi rời tab (chưa có)

**Phát hiện:** `officeStop()` dừng timer và `requestAnimationFrame`, dọn confetti, nhưng
**không đụng tới `OF.atlas`**. Nghĩa là mở tab Văn phòng một lần rồi chuyển sang tab khác và
không bao giờ quay lại, **7.0 MB vùng nhớ ảnh vẫn nằm đó tới lúc đóng cửa sổ**. Trong VSCode
có `retainContextWhenHidden` nên webview sống rất lâu, con số này là vĩnh viễn thật.

Đề xuất:

```js
function officeStop() {
  ...
  // Không thả ngay: bấm nhầm sang tab khác rồi bấm lại là chuyện thường, mà nướng lại
  // tốn 60 ms đứng hình đúng lúc người dùng vừa bấm vào.
  OF.freeTimer = setTimeout(freeAtlas, ATLAS_IDLE_MS);
}

function freeAtlas() {
  if (!OF.atlas) return;
  // Đặt kích thước về 0 trước khi bỏ tham chiếu: đó là cách duy nhất bắt renderer trả lại
  // vùng nhớ ảnh ngay, chứ chờ GC thì có thể vài phút.
  OF.atlas.canvas.width = 0;
  OF.atlas.canvas.height = 0;
  OF.atlas = null;
  OF.bg = null;          // luôn tiện thả cả nền đã nướng
}
```

| Trị số | Đề xuất | Đánh đổi |
| --- | --- | --- |
| `ATLAS_IDLE_MS` | 60 giây | quay lại trong 1 phút thì không mất gì; quá 1 phút thì trả 60 ms nướng lại |

Với nhiều bối cảnh thì con số tiết kiệm còn lớn hơn: atlas nhân vật cộng atlas đạo cụ cộng nền
đã nướng.

### IV.2 Nạp code bối cảnh theo yêu cầu (chưa có)

`sprites.js` và `office.js` hiện nạp ở mọi lần mở trang, kể cả người không bao giờ mở tab Văn
phòng - 72.2 KB (26.3 KB đã gzip) chỉ riêng `office.js`. [docs/hieu-nang.md](hieu-nang.md) đã
liệt kê việc nạp động là "còn tối ưu được", vướng ở chỗ `office.js` và `app.js` gọi thẳng hàm
toàn cục của nhau.

Nhưng **file của một bối cảnh mới thì không vướng**: nó chỉ cần một chiều phụ thuộc là đăng ký
mình vào `SCENES`. Vậy nên:

```text
static/
  office.js            lõi + bối cảnh Văn phòng (nạp như hiện tại)
  scenes/farm.js       nạp khi người dùng chọn nông trại
  scenes/delivery.js   nạp khi người dùng chọn shipper
```

Nạp bằng cách chèn thẻ `<script>` lúc `setScene()`, hiện một ô "đang tải" trong khung hình
trong lúc chờ. Ước lượng mỗi file bối cảnh 25-40 KB thô, 8-12 KB đã gzip. Người dùng chỉ ở
Văn phòng thì không tải một byte nào của nông trại.

Đây chính là câu trả lời cho "chỉ dùng khi cần, không dùng thì clear" ở mức **code**, còn
IV.1 là ở mức **vùng nhớ ảnh**.

### IV.3 Hoãn vẽ ô xem trước cho tới lúc mở bảng chọn (chưa có)

**Phát hiện:** `renderPacks()` chạy trong `officeInit()` và vẽ ngay 3 ô xem trước cho mỗi bộ =
**24 lần gọi `renderCharPreview()`**, mỗi lần tạo 2 canvas, gọi `getImageData` và chạy
`finishCell()`. Nhưng bảng chọn nằm trong `<details class="skinbox">` và mặc định **đang
đóng** - người dùng không nhìn thấy một ô nào trong số đó.

Tương tự, `agentSkinRow()` dựng tới **36 ô xem trước** cho bộ Hải trình mỗi lần mở bảng chi
tiết của một agent.

Đề xuất:

- Vẽ ô xem trước trong sự kiện `toggle` của `<details>`, không phải lúc khởi tạo.
- Khi atlas đã có nhân vật đó rồi thì **cắt thẳng từ atlas** bằng một `drawImage` thay vì vẽ
  lại từ đầu cộng hậu kỳ. Chỉ nhân vật chưa nướng mới đi đường cũ.
- Dãy 36 ô trong bảng chi tiết: dựng lười theo `IntersectionObserver`, ai cuộn tới đâu vẽ tới
  đó.

### IV.4 Nền tĩnh nướng một lần vào canvas rời

Đây là cơ chế **bắt buộc phải có trước khi thêm bối cảnh giàu chi tiết**.

Hiện `drawRoom()` vẽ lại toàn bộ sàn, tường, cửa sổ, kệ sách... mỗi khung hình. Ước lượng đếm
từ code: khoảng 350 lệnh `fillRect` cho kiểu Cổ điển. Một nông trại có cỏ lấm tấm, hàng rào,
luống đất, cây cối sẽ vào khoảng 800-1500 lệnh. Ở 60 fps là gần 90 nghìn lệnh vẽ mỗi giây chỉ
để vẽ đi vẽ lại một thứ không đổi.

Cách làm:

```js
// Nướng ở PIXEL GỐC (260 x 176), không phải ở bậc phóng hiện tại.
function bakeBackground() {
  const cv = document.createElement('canvas');
  cv.width = ROOM_W; cv.height = ROOM_H;
  const g = cv.getContext('2d');
  scene.drawStatic(g, OF.pal, OF.room);
  scene.drawCommon(g, OF.pal);
  OF.bg = cv;
}

// Mỗi khung: một lệnh thay vì mấy trăm.
g.drawImage(OF.bg, 0, 0);
scene.drawAnimated(g, OF.pal);   // đồng hồ, đèn giao thông - phần có nhúc nhích
```

**Vì sao nướng ở pixel gốc mà không mất nét:** bậc phóng luôn là số nguyên
(`Math.floor(avail / ROOM_W)`), `dpr` cũng được làm tròn về số nguyên, và toàn bộ nền là
`fillRect` căn theo toạ độ nguyên. Phóng gần nhất một ảnh nguyên lần cho ra **đúng từng pixel**
giống như vẽ thẳng ở bậc phóng đó. Không có phép nội suy nào xen vào.

| | Nướng ở pixel gốc | Nướng ở bậc phóng hiện tại |
| --- | --- | --- |
| Vùng nhớ | 260 x 176 x 4 = **183 KB** | ở bậc 5, dpr 2: 2600 x 1760 x 4 = **18.3 MB** |
| Phải nướng lại khi `resize()` | **không** | có |
| Nét | y hệt | y hệt |

Nướng lại chỉ khi: đổi scene, đổi kiểu nền, đổi theme (bảng màu). Không phải khi resize, không
phải khi có người đi lại.

### IV.5 Atlas đạo cụ riêng, nướng lười theo bối cảnh

Đạo cụ chia làm hai loại, và phải đi hai đường khác nhau:

| Loại | Ví dụ | Đường đi | Vì sao |
| --- | --- | --- | --- |
| **Có hoạt hoạ, bám nhân vật** | rìu vung, đòn gánh nhún, thùng hàng trên xe | nướng vào **prop atlas**, vẽ bằng `drawImage` | vẽ tay bằng `fillRect` mỗi khung cho 10 người là 10 lần chi phí |
| **Đứng yên, thuộc về chỗ** | luống lúa, đống củi, cửa cuốn kho | vẽ tay trong `drawStation()` | chỉ vài lệnh, và nó phải đổi theo tiến độ nên không nướng sẵn được |

Prop atlas dùng lại y nguyên cơ chế `covers()` / `CHAR_GEN` của atlas nhân vật. Ước lượng kích
thước: ô đạo cụ 24x24 pixel gốc, ở lưới con là 72x72 px thật; 48 ô xếp 8 cột x 6 hàng =
576 x 432 = **0.95 MB**. Nhỏ hơn atlas nhân vật một bậc, và cũng bị thả trong `freeAtlas()`.

### IV.6 Sinh vật nền chạy ở nhịp thấp

Nếu 4 con gà và 1 con chó di chuyển liên tục thì `frameSig()` đổi mỗi khung, và tối ưu
"5 fps khi đứng yên" - thứ tốn công nhất trong đợt tối ưu vừa rồi - biến mất sạch.

Luật:

| Luật | Trị số | Hệ quả |
| --- | --- | --- |
| Sinh vật nền chỉ cập nhật vị trí ở nhịp `AMBIENT_HZ` | 8 lần / giây | khung hình chỉ có sinh vật nền chuyển động thì vẽ **8 fps** thay vì 60 |
| Nhịp chân chỉ chạy khi con vật thật sự đi | như `stepCat` sau khi sửa | con gà đứng mổ thóc không kéo cả khung hình vẽ lại |
| Số con giảm theo bậc phóng | bậc 1: tối đa 2 con; bậc >= 3: đủ | panel hẹp của VSCode vốn đã không nhìn ra con gà 4 pixel |
| Không con nào được che mặt người | dải riêng sát mép dưới, như `CAT_LANE` | bài học đã có: con mèo đi ngang che mất mặt người đang đi bộ |

Bảng ước lượng fps ở trạng thái nghỉ (suy từ luật trên, cần đo lại khi làm):

| Trạng thái | Hiện tại | Với 6 sinh vật nền, không có luật nhịp thấp | Có luật nhịp thấp |
| --- | --- | --- | --- |
| Mọi người ngồi làm việc | 5 fps | ~60 fps | ~8 fps |
| Có người đi lại | 53-60 fps | 60 fps | 53-60 fps |

### IV.7 Ngân sách hiệu năng cho mỗi bối cảnh

Mỗi scene khai `budget` và CI kiểm. Không có ngân sách thì bối cảnh thứ tư sẽ đẹp gấp đôi và
chậm gấp bốn, mà không ai nhận ra cho tới lúc người dùng phàn nàn.

| Chỉ tiêu | Trần | Đo bằng |
| --- | --- | --- |
| Lệnh vẽ mỗi khung (sau khi đã nướng nền) | <= 250 | đếm bằng cách bọc `ctx.fillRect` và `drawImage` |
| Ô đạo cụ trong prop atlas | <= 48 | `scene.props().length` |
| Sinh vật nền | <= 6 | `scene.ambient().length` |
| Thời gian một khung `draw()` | <= 0.3 ms | `performance.now()` quanh `draw()` |
| Vùng nhớ ảnh tổng (nhân vật + đạo cụ + nền) | <= 10 MB với bộ mặc định | `canvas.width * height * 4` |
| fps lúc mọi agent nghỉ | <= 10 | đếm số lần `draw()` chạy trong 5 giây |

Đoạn đo dán thẳng vào console, theo đúng kiểu đã dùng ở [docs/hieu-nang.md](hieu-nang.md):

```js
// đếm lệnh vẽ của một khung
let ops = 0;
const c = OF.ctx, fr = c.fillRect.bind(c), di = c.drawImage.bind(c);
c.fillRect = (...a) => { ops++; return fr(...a); };
c.drawImage = (...a) => { ops++; return di(...a); };
const t0 = performance.now(); invalidate(); draw();
console.log(ops, 'lệnh,', (performance.now() - t0).toFixed(2), 'ms');
```

### IV.8 Giữ nét: ba quy tắc không được phá

Đã có sẵn và phải áp cho mọi bối cảnh mới:

1. **Nhân vật và đạo cụ bám nhân vật vẽ ở lưới con `SPRITE_SS` = 3.** `resize()` chốt
   `OF.spriteSmooth`: chia hết thì tắt nội suy (phóng nguyên lần, nét đanh), không chia hết
   thì bật (tỷ lệ lẻ mà lấy mẫu gần nhất sẽ làm mất những nét mảnh 1/3 pixel).
2. **Đồ đạc trong khung hình vẽ ở pixel gốc và luôn tắt nội suy.** Nền đã nướng cũng vậy - và
   như IV.4 đã nói, vì bậc phóng là số nguyên nên đây là phép sao chép không mất mát.
3. **Không nét nào vượt quá 1 pixel gốc ra ngoài khung 16x20** - đó đúng bằng phần đệm của ô
   trong atlas. Đạo cụ dài (rìu, đòn gánh, cần câu) vì thế **không được nhét vào ô nhân vật**,
   phải là ô đạo cụ riêng vẽ chồng lên.

---

## Phần V - Danh mục bối cảnh

### V.1 Ba bối cảnh đề xuất làm trước

| | Nông trại | Shipper | Bếp nhà hàng |
| --- | --- | --- | --- |
| Hình học | giữ lưới 2x5 của office | đường ngang + 10 địa chỉ | 2 dãy bếp + quầy chuyền món |
| Luật đi | đơn giản hơn office (không có ghế để tránh) | khác hẳn: chạy dọc đường | gần office |
| Vai tầng B | 3 (giếng, chòi, xe hàng) | 4 (kho, ki-ốt) | 2 (kho lạnh, quầy) |
| Sinh vật nền | gà, chó, vịt, bướm | chó, chim, xe khác | mèo, hơi nước |
| Ô đạo cụ ước tính | ~34 | ~26 | ~30 |
| Rủi ro | **thấp** | **trung bình** | thấp |
| Vì sao đáng làm | dùng lại gần hết luật đi của office nên lộ ngay chỗ tách chưa sạch | bẻ gãy giả định "chỗ làm việc là chỗ đứng yên" - bài kiểm tra thật | "task" đọc ra tự nhiên nhất thành "món ăn" |

**Bếp nhà hàng**, phác nhanh vì nó là ứng viên đợt ba: mỗi agent một bếp lò, phiếu order kẹp
trên dây phía trên. `type` = thái rau trên thớt, `run` = xào lửa lớn (lửa bùng lên theo nhịp),
`read` = đọc phiếu order, `web` = ra kho lạnh lấy nguyên liệu, `delegate` = gọi phụ bếp,
`plan` = đứng xem thực đơn, `rest` = lau bếp. Ăn mừng = dọn đĩa lên quầy chuyền, chuông reng.
Tiến độ món hiện ngay trên chảo: nguyên liệu sống => đang xào => đĩa hoàn thiện.

### V.2 Danh mục các bối cảnh còn lại

Chấm theo ba tiêu chí: **hợp** (mô hình agent có ánh xạ tự nhiên không), **rẻ** (khối lượng vẽ
và code), **khác** (có đem lại cảm giác mới không, hay chỉ là office đổi màu).

| Bối cảnh | Ánh xạ chính | Hợp | Rẻ | Khác | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Công trường xây dựng | mỗi agent xây một bức tường, tường cao dần theo tiến độ | cao | vừa | cao | cần cẩu và xe ben làm sinh vật nền rất tốt |
| Cảng biển, kho container | mỗi agent một cần cẩu, sub-agent là xe nâng | cao | vừa | cao | hợp nhất với việc trực quan hoá hàng đợi |
| Phòng thí nghiệm | mỗi agent một bàn thí nghiệm, ống nghiệm sôi theo tiến độ | cao | rẻ | vừa | lỗi thì nổ khói - nhưng backend không báo lỗi, xem V.3 |
| Xưởng rèn trung cổ | búa đe, lò than đỏ rực khi bận | vừa | rẻ | cao | lò sáng là dấu hiệu "có người" tuyệt vời, giống màn hình ở office |
| Trạm không gian | mỗi agent một bảng điều khiển, đi bộ ngoài không gian khi chạy tool lâu | vừa | đắt | cao | nền sao trời tốn nhiều lệnh vẽ, phải nướng sẵn |
| Học viện phép thuật | bàn phù thuỷ, `delegate` = triệu hồi linh thú | vừa | vừa | cao | hợp với bộ nhân vật Nhẫn giả và Hải trình sẵn có |
| Quán cà phê | barista pha chế, khách vào ra | vừa | rẻ | vừa | gần bếp quá, làm cả hai thì trùng |
| Ga tàu điều độ | mỗi agent một sân ga, tàu vào ra theo tool | vừa | đắt | cao | tàu chạy làm `frameSig` không bao giờ trùng, tốn như shipper |
| Đội cứu hoả | task là đám cháy, agent chạy tới dập | thấp | vừa | cao | ánh xạ ngược đời: agent bận thành ra "đang có sự cố", dễ gây hiểu nhầm là lỗi |
| Sân vận động | mỗi agent một cầu thủ tập luyện | thấp | rẻ | thấp | không có khái niệm "chỗ làm việc" rõ ràng |

### V.3 Đã cân nhắc và loại

- **Bối cảnh dùng lỗi/thất bại làm hoạt cảnh** (đám cháy, ống nghiệm nổ, tường sập). Payload
  hiện **không có** khái niệm "tool chạy thất bại" - `office.py` chỉ biết tool nào đang chạy,
  không biết nó kết thúc ra sao. Muốn có phải sửa `claude.py` để đọc kết quả tool, việc đó
  đáng làm nhưng là một dự án riêng, đừng buộc vào đây.
- **Bối cảnh cần cuộn khung hình** (bản đồ rộng hơn màn hình, camera bám nhân vật). Phá bất
  biến số 1, kéo theo `resize()`, hit test, ô xem trước và cả `frameSig`. Lợi ích không tương
  xứng.
- **Bối cảnh 3D giả hoặc góc nhìn nghiêng (isometric).** Toàn bộ 127 nhân vật đang vẽ ở góc
  nhìn thẳng; góc nghiêng đòi vẽ lại tất cả.

---

## Phần VI - Kế hoạch thi công

> **Ghi lại sau khi làm xong.** Kế hoạch dưới đây giữ nguyên như lúc lập; những chỗ thực tế
> đi khác được ghi trong khung trích dẫn ngay dưới giai đoạn tương ứng.

### Giai đoạn 0 - Đo mốc (nửa ngày)

Trước khi đụng code, ghi lại số hiện tại để sau này so: lệnh vẽ mỗi khung, thời gian `draw()`,
fps lúc nghỉ, vùng nhớ atlas, thời gian nướng. Dùng đúng đoạn đo ở [IV.7](#iv7-ngân-sách-hiệu-năng-cho-mỗi-bối-cảnh)
và mục "Cách đo lại" của [docs/hieu-nang.md](hieu-nang.md).

**Nghiệm thu:** một bảng số nằm trong tài liệu này, mục "Mốc trước khi làm".

### Giai đoạn 1 - Ba tối ưu độc lập (1-2 ngày)

Làm trước và tách riêng, vì chúng **không phụ thuộc gì vào việc thêm bối cảnh** và có ích ngay:

1. [IV.1](#iv1-giải-phóng-atlas-khi-rời-tab-chưa-có) thả atlas khi rời tab.
2. [IV.3](#iv3-hoãn-vẽ-ô-xem-trước-cho-tới-lúc-mở-bảng-chọn-chưa-có) hoãn ô xem trước.
3. [IV.4](#iv4-nền-tĩnh-nướng-một-lần-vào-canvas-rời) nướng nền vào canvas rời.

**Nghiệm thu:** hình ảnh không đổi một pixel; lệnh vẽ mỗi khung giảm từ ~560 xuống ~210; vùng
nhớ ảnh về 0 sau 60 giây rời tab.

### Giai đoạn 2 - Tách lớp SCENE (2-3 ngày, rủi ro cao nhất)

Chuyển **nguyên khối** code office vào `SCENES[0]`. Không viết lại, không "dọn dẹp nhân tiện",
không đổi tên biến. Diff phải đọc ra là di chuyển thuần tuý.

Kèm theo: `SCENE_KEY` ở localStorage, tham số `?scene=`, khoá `office_scene` ở
`config_file.py`, enum ở `package.json`, nhãn i18n hai ngôn ngữ, và chuyển kiểu nền vào trong
scene (lưu theo cặp `scene:room`, mỗi scene khai `defaultRoom`).

**Nghiệm thu:** chạy tab Văn phòng và xác nhận **không có gì đổi**. Đúng zero thay đổi hình
ảnh là tiêu chí đạt. Chạy lại đủ danh sách ở [Phần VI cuối](#danh-sách-nghiệm-thu-dùng-chung-cho-mọi-giai-đoạn).

> **Thực tế:** làm gộp cả ba tối ưu vào cùng đợt với việc tách lớp, vì `bakeBackground()` đằng
> nào cũng phải viết theo hợp đồng `drawStatic` / `drawAnimated` của lớp SCENE. Nghiệm thu
> bằng ảnh chụp canvas trước/sau: bối cảnh Văn phòng không đổi một pixel nào.

### Giai đoạn 3 - Nông trại (3-4 ngày)

Theo thứ tự này, mỗi bước xem được kết quả:

1. Hình học và nền tĩnh: ruộng, hàng rào, rừng, đường đất, 4 kiểu nền.
2. Chỗ làm việc: thửa ruộng có `growth`, đống củi.
3. Vai tầng A: 6 vai, đạo cụ nướng vào prop atlas.
4. Vai tầng B: giếng nước, chòi canh, xe hàng rong, cùng luật `TRIP_HOLD`.
5. Sinh vật nền: gà, chó, vịt, theo luật nhịp thấp.
6. Ăn mừng kiểu gặt.

**Nghiệm thu:** ngân sách hiệu năng ở [IV.7](#iv7-ngân-sách-hiệu-năng-cho-mỗi-bối-cảnh) đạt
hết; đổi qua đổi lại giữa office và nông trại 20 lần không rò vùng nhớ; mọi cái bẫy trong
danh sách chung không tái xuất hiện.

> **Thực tế - ba chỗ đi khác thiết kế:**
>
> - **Không có landmark dùng chung** (giếng nước, chòi canh, xe hàng rong). Thay vào đó mỗi
>   thửa có HAI chỗ đứng - giữa thửa và cạnh đống củi - và nghề quyết định đứng chỗ nào. Đổi
>   chỗ trong thửa của mình là một bước thẳng, không phải xuống bờ rồi vòng lên, nên không
>   phát sinh cả một tầng đường đi mới cùng rủi ro nhân vật kẹt đi kèm. Vẫn được cái cảm giác
>   "mỗi người một việc" mà không đụng vào chỗ dễ sinh nhân vật ma nhất.
> - **Luống đất phải vẽ lại hai lần.** Bản đầu dùng vạch DỌC đều tăm tắp và cả năm thửa trông
>   hệt năm cái thùng gỗ; bản hai đổi sang gờ NGANG chạy suốt thì thành thớ ván. Phải là gờ
>   ngang ĐỨT ĐOẠN so le, cộng màu đất tối hơn màu gỗ hẳn một bậc, mới đọc ra là đất cày.
> - **Cỏ phải tự suy sáng/tối từ `--of-floor`.** `--of-plant` và `--of-desk` gần như không đổi
>   giữa hai theme, nên bản đầu bấm sang nền sáng mà cánh đồng vẫn tối om trong khi cả trang
>   đã sáng. Tên agent cũng phải đổi màu theo, nếu không nó chìm hẳn vào cỏ ở một trong hai
>   theme.

### Giai đoạn 4 - Shipper (3-4 ngày)

Đây là bối cảnh đầu tiên thật sự bẻ gãy giả định "chỗ làm việc là chỗ đứng yên". Nếu lớp SCENE
ở giai đoạn 2 tách chưa đủ sạch thì nó sẽ lộ ra ở đây, không phải ở nông trại.

Thêm mục riêng: kiểm fps và CPU ở trạng thái đông xe, vì đây là bối cảnh duy nhất gần như
không bao giờ vẽ trùng khung.

> **Thực tế - bối cảnh này đúng là chỗ lộ ra nhiều lỗi nhất, cả bốn đều thuộc loại "nhìn giả
> trân" mà không có gì báo lỗi:**
>
> - **Bố cục phải là HAI con đường, không phải một.** Với một con đường ở giữa, shipper của
>   hàng nhà dưới buộc phải đứng DƯỚI nhà mình (mới được vẽ đè lên nhà) nhưng lại chạy xe ở
>   con đường PHÍA TRÊN nhà - mỗi chuyến xuyên qua chính ngôi nhà của mình.
> - **Làn xe phải nằm trọn trong mặt đường, tính cả bóng đổ.** Lệch làn 4 pixel là bánh xe
>   người chạy đường trên thò xuống đè lên mái hàng nhà dưới - mà nhà nằm trong nền đã nướng
>   nên vẽ trước, tức cái xe đè lên thứ lẽ ra phải che nó. Trần thật là 2 pixel, và cái chặn
>   không phải thân người mà là bóng bầu dục dưới gầm xe.
> - **Chặng rẽ từ nhà xuống đường phải chéo, ngả ngang hơn ngả dọc**, nếu không `dir` ra
>   'down' và khung hình chuyển sang tư thế nhìn từ sau lưng.
> - **Bong bóng thoại neo vào đầu người, không vào nóc nhà.**
>
> Vòng chạy xe đã chạy thật 40 giây liên tục với 10 xe cùng lúc: đi qua cả hai chặng, về tới
> nơi đứng giao hàng rồi đi chuyến mới, không ai kẹt, không nhân vật ma.

### Giai đoạn 5 - Nạp theo yêu cầu và bối cảnh thứ tư (2-3 ngày)

[IV.2](#iv2-nạp-code-bối-cảnh-theo-yêu-cầu-chưa-có) tách file bối cảnh ra, nạp động. Chỉ làm
sau khi đã có ba bối cảnh, vì lúc đó mới biết cái gì thật sự dùng chung và cái gì riêng - làm
sớm là đoán mò.

Bối cảnh thứ tư (bếp hoặc công trường) là bài kiểm tra: nếu thêm nó **chỉ cần một file mới**
và không sửa dòng nào ở lõi, kiến trúc coi như đạt.

> **Thực tế: đã làm.** `SCENE_LAZY` khai id + đường dẫn, `SCENE_ORDER` khai thứ tự bày ra
> (khai riêng vì thứ tự ĐĂNG KÝ nay phụ thuộc người dùng chọn gì trước). File được kéo về ở ba
> thời điểm: lúc trang dựng nếu bối cảnh đã lưu khác Văn phòng, lúc mở bảng chọn bối cảnh, và
> lúc `setScene()` nhận id chưa nạp. Đo bằng cách đếm request trong trình duyệt: chỉ dùng Văn
> phòng thì **không tải một byte nào** của hai file kia; mở bảng chọn thì kéo cả hai về để có
> ô xem trước; lần sau mở trang thì nạp trước ĐÚNG một file đã lưu.
>
> Tải hỏng thì ở lại bối cảnh cũ và xoá khỏi bảng ghi nhớ để lần bấm sau thử lại được - đã
> kiểm bằng cách trỏ `SCENE_LAZY` vào một file không tồn tại.
>
> Phần kiến trúc cũng đã kiểm: cả hai bối cảnh mới nằm gọn trong một file,
> chỉ gọi `registerScene()` và mấy hàm vẽ dùng chung (`px2`, `floorTiles`, `darken`), không
> sửa một dòng nào của lõi ngoài việc THÊM hook mới (`seatOf`, `cutFor`, `flipFor`, `bobFor`,
> `speedFor`, `shadowFor`, `labelColor`, `sceneSig`). Danh sách hook đó chính là bề mặt cần
> đóng băng trước khi làm bối cảnh thứ tư.

### Danh sách nghiệm thu dùng chung cho mọi giai đoạn

Mỗi mục dưới đây là một lỗi đã gặp thật, ghi trong CLAUDE.md. Phải chạy lại hết sau mỗi giai
đoạn.

| # | Kiểm gì | Cách thử |
| --- | --- | --- |
| 1 | Không có nhân vật ma | tắt vài phiên Claude cùng lúc, đếm số nhân vật khớp con số ở header |
| 2 | Không ai chui xuyên qua ghế / vật cản | rê chuột vào người đang ngồi, xem họ có nhảy khỏi chỗ không |
| 3 | Rê chuột ra khỏi khung hình thì người đang chào đi tiếp | rê vào một người rảnh rồi rê ra ngoài canvas |
| 4 | Chỗ có người thì nhìn ra được từ xa | thu nhỏ về bậc phóng 1, đếm số chỗ đang sáng |
| 5 | Ăn mừng diễn ở chỗ của chính mình | tắt một phiên lúc nhân vật đang đi vòng vòng |
| 6 | Canvas không bị `morph()` thay | để tab mở 30 giây, xem nhân vật có nhảy về vị trí đầu không |
| 7 | Đổi bộ nhân vật thì ai vẫn ở chỗ cũ | bấm đổi bộ giữa lúc đông người |
| 8 | Đổi theme thì nền nướng lại | bấm nút sáng/tối |
| 9 | Thu gọn panel VSCode thì ngừng hẳn | đếm `fetch` trong 5 giây, phải là 0 |
| 10 | Ngân sách hiệu năng | đoạn đo ở [IV.7](#iv7-ngân-sách-hiệu-năng-cho-mỗi-bối-cảnh) |

---

## Phần VII - Danh sách phải khớp và CI

Đang có luật: bộ nhân vật nằm ở 3 chỗ cộng i18n 2 ngôn ngữ, CI kiểm cả 4
(`.github/workflows/build-vscode.yml`). Thêm trục scene là thêm đúng bộ ấy, cộng vài assert
mới.

| Chỗ | Thêm gì |
| --- | --- |
| `aimon/static/office.js` (hoặc `scenes/*.js`) | `SCENES` - nơi vẽ |
| `aimon/config_file.py` | `OFFICE_SCENES` cộng khoá `office_scene` |
| `vscode-extension/package.json` | enum `aimon.officeScene` |
| `aimon/static/i18n.js` | `office.scene_<id>` x 2 ngôn ngữ, và `office.room_<id>` cho mọi nền mới |
| `aimon/static/i18n.js` | `office.role_<id>` x 2 ngôn ngữ nếu chú giải hiện tên vai |
| `.github/workflows/build-vscode.yml` | các assert dưới đây |
| `.github/workflows/build-vscode.yml` | thêm file `scenes/*.js` vào bước soát danh sách file trong gói |

Assert cần thêm trong CI:

```python
# 1. Bốn danh sách scene khớp nhau (y như đang làm với pack)
assert sorted(scenes_js) == sorted(OFFICE_SCENES) == sorted(enum_pkg)
# 2. Mỗi scene đủ 2 bản dịch, và mọi kiểu nền của nó cũng vậy
# 3. Mỗi scene có >= MAX_AGENTS chỗ  (đọc số chỗ khai trong file scene)
# 4. Mỗi scene khai đủ budget, và các trị số không vượt trần
# 5. defaultPack và defaultRoom của mỗi scene phải tồn tại thật
```

Assert số 3 là quan trọng nhất: nó chính là bản mở rộng của cái bẫy "số bàn trong `office.js`
phải khớp `MAX_AGENTS` trong `office.py`" mà CLAUDE.md đã ghi.

Ngoài ra `node --check` phải chạy cho **tất cả** file trong `aimon/static/` kể cả thư mục con.
Lệnh hiện tại là `for f in aimon/static/*.js` - có ở `.github/workflows/build-macos.yml` dòng
23 và ở mục "Kiểm tra trước khi commit" của `CLAUDE.md` - nên nó sẽ **bỏ sót**
`aimon/static/scenes/*.js`. Đã kiểm chứng bằng cách đọc cả hai chỗ. Đây là kiểu hỏng lặng lẽ
quen thuộc: CI vẫn xanh, lỗi cú pháp vẫn lên tới bản phát hành. Sửa thành
`find aimon/static -name '*.js'` ngay ở giai đoạn 2, đừng chờ tới lúc thật sự có thư mục con.

---

## Phần VIII - Sổ rủi ro

| # | Rủi ro | Xác suất | Hậu quả | Cách chặn |
| --- | --- | --- | --- | --- |
| 1 | Refactor giai đoạn 2 làm sống lại lỗi nhân vật ma | cao | người dùng mất tin vào cả panel | chuyển nguyên khối, không viết lại; giữ cả hai lớp chặn `leaving` và `LEAVE_TIMEOUT`; danh sách nghiệm thu mục 1 |
| 2 | Đổi vai làm nhân vật co giật | cao | nhìn như lỗi | ba lớp chặn ở [III.3](#iii3-chống-nhấp-nháy---luật-đổi-vai), có trị số cụ thể |
| 3 | Sinh vật nền phá tối ưu 5 fps | cao | CPU tăng gấp nhiều lần khi không ai nhìn kỹ | luật nhịp thấp ở [IV.6](#iv6-sinh-vật-nền-chạy-ở-nhịp-thấp), CI kiểm ngân sách fps |
| 4 | Vùng nhớ ảnh phình khi đổi scene qua lại | trung bình | tab ăn vài chục MB rồi không trả | `freeAtlas()` thả cả ba thứ; nghiệm thu bằng cách đổi qua lại 20 lần |
| 5 | Bối cảnh mới đẹp nhưng chậm, không ai phát hiện | trung bình | tích luỹ dần, tới lúc phát hiện thì khó gỡ | ngân sách khai trong scene, CI kiểm |
| 6 | Kiểu nền cũ lưu ở localStorage không tồn tại ở scene mới | chắc chắn xảy ra | rơi về nền đầu tiên một cách lặng lẽ | lưu theo cặp `scene:room`, mỗi scene khai `defaultRoom` |
| 7 | Đạo cụ dài vượt khung 16x20 dính sang ô hàng xóm | trung bình | vệt bẩn trên nhân vật khác | đạo cụ dài phải là ô riêng, không nhét vào ô nhân vật ([IV.8](#iv8-giữ-nét-ba-quy-tắc-không-được-phá)) |
| 8 | `node --check` bỏ sót thư mục con | cao | lỗi cú pháp JS lọt vào bản phát hành | sửa lệnh trong CI ngay ở giai đoạn 2 |
| 9 | File `office.js` phình quá to | trung bình | khó đọc, khó review | tách file bối cảnh ở giai đoạn 5, và tách sớm hơn nếu vượt 2500 dòng |

---

## Phần IX - Câu hỏi còn mở

Cần chốt trước khi bắt đầu giai đoạn 2:

1. **Bộ lọc loại agent có nên khác nhau theo scene không?** Hiện một thanh chip dùng chung cho
   tab AI & Agent và tab Văn phòng, và CLAUDE.md ghi rõ lý do không tách. Nghiêng về: giữ
   nguyên, dùng chung, không đụng.
2. **Nút chọn scene đặt ở đâu?** Hiện có hai hộp `<details>` (Phòng, Bộ nhân vật). Thêm hộp
   thứ ba thì ở panel hẹp của VSCode sẽ chật. Nghiêng về: một hàng nút scene nằm **trên** cùng,
   và hộp "Nền" nằm trong đó đổi nội dung theo scene đang chọn.
3. **Có cho phép mỗi scene tự đặt `MAX_AGENTS` không?** Nghiêng về **không** - giữ 10 cho mọi
   scene, đơn giản hơn nhiều và `office.py` không phải biết gì về scene.
4. **Tên vai có hiện trong chú giải không?** Nếu có thì phải thêm `office.role_*` cho từng vai
   của từng scene, tức 9 khoá x 2 ngôn ngữ x số scene. Nghiêng về: chú giải vẫn giữ 8 mã hoạt
   cảnh chung như hiện nay, chỉ đổi câu chữ mô tả theo scene.
5. **Bộ nhập từ ảnh có được phụ kiện theo scene không?** Nón lá đè lên một nhân vật do người
   dùng nhập có thể lệch chỗ, vì ảnh của họ không đảm bảo đầu nằm ở hàng 0-9. Nghiêng về: bật
   sẵn, nhưng cho tắt bằng một ô đánh dấu trong bảng chọn.
