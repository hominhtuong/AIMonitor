---
name: merge-code
description: Merge nhánh vào main an toàn cho repo AIMonitor - thử merge trên nhánh tạm trước, chạy kiểm tra, xử lý xung đột, rồi merge thật hoặc mở Pull Request. Dùng khi người dùng nói "merge code", "gộp nhánh", "merge vào main", "tạo PR".
---

# Merge code

Nguyên tắc: **không merge mù**. Thử trên nhánh tạm, thấy xanh mới merge thật.

## Bước 1 - Chốt đang merge cái gì vào cái gì

```bash
git rev-parse --abbrev-ref HEAD          # nhánh nguồn
git fetch origin
git log --oneline origin/main..HEAD      # commit sẽ được đưa vào
git diff --stat origin/main...HEAD       # phạm vi thay đổi
```

Nếu người dùng chưa nói rõ nhánh đích thì mặc định `main` và nói ra giả định đó.
Còn thay đổi chưa commit => commit hoặc `git stash` trước.

## Bước 2 - Thử merge trên nhánh tạm

```bash
SRC=$(git rev-parse --abbrev-ref HEAD)
git checkout -b merge-test/$SRC origin/main
git merge --no-ff --no-commit $SRC
```

- Sạch => sang bước 3.
- Xung đột => `git diff --name-only --diff-filter=U` để liệt kê file. **Đọc cả hai phía** rồi sửa; đừng
  chọn bừa một bên. Không tự quyết được thì báo người dùng kèm nội dung xung đột.

## Bước 3 - Kiểm tra trước khi merge thật

```bash
python3 -m py_compile aimon/server.py aimon/snapshot.py aimon/collectors/*.py
python3 -c "import sys; sys.path.insert(0,'.'); from aimon import snapshot; snapshot.build(); print('snapshot OK')"
python3 -m aimon.server --port 8998 &   # chạy thử 3 giây
sleep 3; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8998/api/snapshot; kill %1
```

Có lỗi => sửa trên nhánh nguồn, không "sửa cho qua" trong lúc merge.

## Bước 4 - Merge thật hoặc mở PR

**Có quyền push main và người dùng muốn merge trực tiếp:**

```bash
git checkout main && git pull --ff-only origin main
git merge --no-ff $SRC -m "merge: $SRC vào main"
git push origin main
git branch -D merge-test/$SRC
```

**Cần review (mặc định nếu không rõ):**

```bash
git push -u origin $SRC
gh pr create --base main --head $SRC --title "<tiêu đề>" --body "<những gì đã đổi, cách kiểm chứng>"
```

Không có `gh` thì in link tạo PR để người dùng bấm.

## Bước 5 - Dọn

```bash
git branch -D merge-test/$SRC 2>/dev/null
git branch -d $SRC              # chỉ khi đã merge xong và người dùng đồng ý
```

## Cấm

- `git push --force` lên `main`.
- `git merge -X ours/theirs` để né xung đột mà chưa đọc nội dung.
- `git reset --hard` khi đang có thay đổi chưa lưu của người dùng.
- Xoá nhánh remote của người khác.
