# Tự tạo bộ nhân vật cho khung nhìn Văn phòng

Khung nhìn Văn phòng có sẵn bốn bộ nhân vật (Văn phòng, Thú cưng, Slime, Mascot). Ngoài ra bạn
đưa được ảnh của mình vào: bấm nút **+** ở mục **Bộ nhân vật** ngay dưới căn phòng, chọn một
tấm ảnh có nhiều nhân vật, tool tự tách thành một bộ.

Tài liệu này nói rõ tool tách theo quy tắc nào, để bạn vẽ cho khớp ngay từ đầu thay vì thử đi
thử lại.

> **Ảnh không rời khỏi máy bạn.** File được đọc ngay trong trang bằng `FileReader`, xử lý bằng
> canvas, kết quả cất ở bộ nhớ trình duyệt. Không có lời gọi mạng nào, và bộ bạn thêm không
> nằm trong bản phát hành của tool. Nghĩa là bạn dùng ảnh nào cũng được, miễn là bạn có quyền
> dùng nó cho mục đích của mình - nhưng nó sẽ không đi kèm khi tool được phát hành cho người
> khác.

---

## Mục lục

1. [Làm nhanh: bố cục lý tưởng](#1-làm-nhanh-bố-cục-lý-tưởng)
2. [Tool tách ảnh thế nào](#2-tool-tách-ảnh-thế-nào)
3. [Bảng ngưỡng chính xác](#3-bảng-ngưỡng-chính-xác)
4. [Hai giới hạn phải biết trước khi vẽ](#4-hai-giới-hạn-phải-biết-trước-khi-vẽ)
5. [Danh sách tự soát](#5-danh-sách-tự-soát)
6. [Tách sai thì sửa thế nào](#6-tách-sai-thì-sửa-thế-nào)

---

## 1. Làm nhanh: bố cục lý tưởng

Nếu chỉ đọc một mục thì đọc mục này.

- **PNG, nền trong suốt.** Cả bốn góc ảnh trong suốt thì tool bỏ qua hẳn bước đoán màu nền -
  không có gì để đoán sai.
- **Vẽ mỗi nhân vật ở đúng bội số nguyên của `16x20`**: `32x40`, `48x60`, hoặc `64x80`. Thu nhỏ
  ra tỷ lệ chẵn (chia 2, 3, 4) nên nét pixel không bị nhoè.
- **Chừa ít nhất 2 pixel trống giữa hai nhân vật**, kể cả theo đường chéo.
- **Mọi nhân vật cùng cỡ, cùng tỷ lệ.**
- **Tỷ lệ mỗi nhân vật gần 4:5** (cao hơn rộng), khớp khuôn `16x20`.
- **Một tư thế đứng nhìn thẳng là đủ.** Không cần vẽ tư thế đi hay ngồi.
- **Không để dấu chìm, chữ ký, hay chú thích** trong ảnh.
- Tối đa **40 nhân vật** một tấm.

Ví dụ một tấm chuẩn: PNG `240x200`, lưới 5 cột x 4 hàng, mỗi ô `48x60` chứa một nhân vật vẽ
cao khoảng 55px, chừa lề 2-3px quanh mỗi ô. Ra đúng 20 nhân vật.

---

## 2. Tool tách ảnh thế nào

### Bước 1 - Tách nền

Lấy màu ở bốn góc ảnh, màu nào xuất hiện nhiều nhất thì coi đó là màu nền. Sau đó loang từ
**mép ảnh vào trong** (4 hướng), pixel nào cách màu nền dưới ngưỡng thì xoá đi.

Loang từ mép chứ không lọc theo màu trên toàn ảnh, vì nếu lọc toàn ảnh thì nhân vật mặc áo
trắng đứng trên nền trắng sẽ bị thủng một lỗ giữa người. Đi từ mép vào thì chỉ vùng nào **nối
ra được tới mép** mới bị coi là nền.

**Cả bốn góc đã trong suốt thì bước này bị bỏ qua hoàn toàn.** Đây là lý do nên dùng PNG.

### Bước 2 - Tìm từng nhân vật

Loang 8 hướng trên phần còn lại; mỗi vùng liên thông là một nhân vật.

Hệ quả: **hai nhân vật chạm nhau dù chỉ ở một góc pixel là bị coi làm một.**

### Bước 3 - Gắn mẩu lẻ về đúng chủ

Một nhân vật hay bị vỡ thành vài mảnh rời: cái mũ tách khỏi đầu, con mắt nằm lọt trong mảng màu
khác, cái đuôi hở một pixel.

- Khung nào có diện tích **>= 30% diện tích trung vị** thì là nhân vật thật.
- Nhỏ hơn thì là mẩu lẻ, đi tìm nhân vật gần nhất và nhập vào, nếu khoảng cách
  **<= 15% cạnh dài của nhân vật đó**.
- Mẩu lẻ không ai nhận thì bỏ.

**Hai nhân vật thật không bao giờ nhập vào nhau**, đứng sát đến mấy cũng vậy.

### Bước 4 - Bỏ rác

Chỉ chạy khi tách được từ 3 khung trở lên (ít hơn thì trung vị vô nghĩa). Bỏ khung nào:

- diện tích **< 8%** diện tích trung vị, hoặc
- tỷ lệ ngang/dọc lệch **quá 2.2 lần** so với tỷ lệ trung vị.

Luật thứ hai là thứ giết dấu chìm và chữ ký: chúng là một dải chữ nằm ngang, tỷ lệ lệch hẳn so
với nhân vật.

> Lọc theo **độ đặc** (số pixel có màu chia cho diện tích khung) thì **không ăn** - đã thử. Một
> dấu chìm chữ pixel đo được độ đặc 0.91, đặc hơn quá nửa số nhân vật thật trong cùng tấm.

### Bước 5 - Đưa về khuôn 16x20

```text
tỷ lệ = min(16 / chiều_rộng, 20 / chiều_cao)
```

Thu nhỏ bằng phép lấy trung bình vùng, **căn giữa theo chiều ngang, căn đáy theo chiều dọc**
(nhân vật phải đứng trên sàn), rồi cắt ngưỡng alpha ở 128 để mép lại sắc nét.

### Thứ tự sắp xếp

Trên xuống dưới, trái sang phải. Hai nhân vật được coi là **cùng hàng** khi lệch dọc chưa tới
**nửa chiều cao trung bình** - nên bố cục so le vẫn ra đúng thứ tự đọc.

---

## 3. Bảng ngưỡng chính xác

| Tham số | Giá trị | Nghĩa |
| --- | --- | --- |
| Sai khác màu nền | **38** | khoảng cách RGB Euclid; xa hơn ngưỡng này thì không bị coi là nền |
| Ô nhỏ nhất | **6 x 6 px** | nhỏ hơn thì bỏ |
| Diện tích tương đối | **>= 8%** ô trung vị | nhỏ hơn thì bỏ |
| Ngưỡng "là nhân vật thật" | **>= 30%** ô trung vị | nhỏ hơn thì bị coi là mẩu lẻ |
| Tầm với của mẩu lẻ | **15%** cạnh dài nhân vật | xa hơn thì mẩu lẻ bị bỏ |
| Lệch tỷ lệ ngang/dọc | **<= 2.2 lần** trung vị | lệch hơn thì bỏ |
| Số nhân vật tối đa | **40** | dư thì lấy 40 cái đầu và báo lại |
| Khuôn đích | **16 x 20 px** | tỷ lệ 0.8 |

Ngưỡng nằm ở đầu file [`aimon/static/packimport.js`](../aimon/static/packimport.js) nếu bạn
muốn chỉnh.

---

## 4. Hai giới hạn phải biết trước khi vẽ

### Kích thước tương đối không giữ được

Mỗi nhân vật được thu **độc lập** cho vừa khuôn `16x20`. Nên con mèo nhỏ vẽ cạnh người cao sẽ
thành cao bằng nhau khi vào phòng.

Thêm khoảng trống quanh nhân vật nhỏ cũng không giải quyết được: tool cắt sát vào phần có màu,
khoảng trống bị bỏ đi trước khi thu nhỏ.

Muốn giữ chênh lệch chiều cao thì tách thành hai bộ riêng.

### Chỉ cần một tư thế

Phòng dùng 13 khung hình mỗi nhân vật (đi xuống / lên / ngang mỗi hướng 3 nhịp, ngồi nghỉ, ngồi
gõ 2 nhịp, ngồi gục). Tool **không đòi** bạn vẽ đủ chừng đó: với bộ nhập từ ảnh, nó tự nhún 1
pixel theo nhịp đi và rung nhẹ sang hai bên khi gõ phím.

Đủ để nhìn ra ai đang đi, ai đang làm việc. Chỉ vẽ **một tư thế đứng nhìn thẳng** cho mỗi nhân
vật là xong.

### Tool không tô viền thêm

Bộ dựng sẵn được tô viền tối 1 pixel bằng code. Bộ nhập từ ảnh thì **không** - viền là do bạn
vẽ. Nếu muốn nhân vật nổi bật trên nền phòng thì tự vẽ viền tối quanh silhouette.

---

## 5. Danh sách tự soát

Trước khi nhập, soát lại:

- [ ] File là PNG, nền trong suốt (hoặc nền đặc một màu, cách xa mọi màu trên nhân vật)
- [ ] Bốn góc ảnh là nền, không có nhân vật nào chạm vào góc
- [ ] Giữa hai nhân vật có ít nhất 2 pixel trống, kể cả chéo
- [ ] Các nhân vật xấp xỉ cùng kích thước
- [ ] Tỷ lệ mỗi nhân vật gần 4:5
- [ ] Không có dấu chìm, chữ ký, tiêu đề, số thứ tự
- [ ] Không quá 40 nhân vật
- [ ] Bộ phận rời (mũ, tai, đuôi) cách thân không quá 15% cạnh dài nhân vật

---

## 6. Tách sai thì sửa thế nào

| Hiện tượng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Chỉ ra 1 nhân vật | các nhân vật dính nhau, hoặc nền không tách được | nới khoảng cách; đổi sang PNG nền trong suốt |
| Ra ít hơn số thật | nền quá giống màu nhân vật nên phép loang ăn lẹm vào thân | đổi màu nền cho khác hẳn, hoặc dùng nền trong suốt |
| Nhiều nhân vật gộp làm một | chúng chạm nhau, kể cả chỉ một góc pixel | chừa >= 2 pixel trống mọi phía |
| Thừa vài ô lạ | dấu chìm, chữ ký, hoặc bụi do nén JPG | xoá chúng khỏi ảnh; hoặc kệ, phần lớn đã bị lọc |
| Nhân vật mất mũ / mất đuôi | bộ phận rời nằm xa thân quá 15% cạnh dài | vẽ dính vào thân, hoặc kéo lại gần |
| Nhân vật bị dẹt / nhỏ tí | tỷ lệ ngang dọc quá lệch so với 4:5 | vẽ lại theo khuôn cao hơn rộng |
| Nét bị nhoè | kích thước nguồn không phải bội số nguyên của 16x20 | vẽ ở 32x40, 48x60, hoặc 64x80 |
| Bộ biến mất sau khi xoá bộ nhớ trình duyệt | bộ nhập cất ở localStorage | nhập lại; giữ file gốc để dùng lại |

---

## Ghi chú

- Tool giữ tối đa **6 bộ** nhập vào. Thêm bộ thứ 7 thì bộ cũ nhất bị đẩy ra.
- Xoá một bộ bằng nút `x` ở góc ô của nó trong bảng chọn.
- Chọn một bộ thì cả phòng dùng bộ đó, mỗi agent một nhân vật khác nhau; quá số nhân vật thì
  quay vòng dùng lại.
- Bấm vào một nhân vật trong phòng thì bảng chi tiết hiện dãy nhân vật của bộ đang dùng - bấm
  một cái để đổi riêng cho người đó.
