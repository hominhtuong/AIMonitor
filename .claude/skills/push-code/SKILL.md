---
name: push-code
description: Commit và push code của repo AIMonitor một cách an toàn - xem lại diff, tự viết commit message theo chuẩn repo, tạo nhánh nếu đang đứng ở main, kiểm tra không lọt secret, rồi push. Dùng khi người dùng nói "push code", "commit và push", "đẩy code lên git".
---

# Push code

Mục tiêu: đưa thay đổi lên remote mà không làm bẩn `main`, không lọt secret, và commit message đọc là hiểu.

## Bước 1 - Xem có gì để đưa lên

```bash
git status --short
git diff --stat
git diff                 # đọc thật, đừng commit thứ mình chưa xem
git log --oneline -5     # học cách viết message của repo này
```

Nếu không có gì thay đổi thì báo lại và dừng, không tạo commit rỗng.

## Bước 2 - Chặn secret trước khi commit

```bash
git diff --cached --name-only; git diff --name-only
grep -rInE "(sk-ant-|ghp_|BEGIN [A-Z ]*PRIVATE KEY|password\s*=|api[_-]?key\s*=)" \
     $(git diff --name-only) 2>/dev/null | head
```

Có dấu hiệu secret => **dừng lại**, báo người dùng, không commit. File cấu hình cá nhân thì thêm vào
`.gitignore` thay vì commit.

## Bước 3 - Không commit thẳng lên main

```bash
git rev-parse --abbrev-ref HEAD
```

Nếu đang ở `main` (hoặc `master`) và thay đổi không phải sửa nhỏ tài liệu:

```bash
git checkout -b <loại>/<mô-tả-ngắn>     # ví dụ: feat/usage-panel, fix/scroll-jump
```

Quy ước nhánh: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`.

## Bước 4 - Commit

Chỉ `git add` những file thuộc thay đổi này (đừng `git add -A` khi trong repo còn rác).

Message: dòng đầu ≤ 72 ký tự, thể hiện **kết quả**, không phải "update code". Thân message nói **vì sao**
nếu lý do không hiển nhiên. Ví dụ:

```
fix: bỏ đếm trùng token do partial message

Claude Code ghi cùng message.id nhiều lần khi bật --include-partial-messages,
làm token và chi phí phồng gần gấp đôi. Chỉ tính bản ghi đầu tiên; đã đối chiếu
khớp với npx ccusage.
```

Không thêm dòng "Generated with ..." nếu người dùng chưa yêu cầu.

## Bước 5 - Chạy thử nhanh trước khi push

```bash
python3 -m py_compile aimon/server.py aimon/snapshot.py aimon/collectors/*.py
python3 -c "import sys; sys.path.insert(0,'.'); from aimon import snapshot; snapshot.build(); print('snapshot OK')"
```

Fail thì sửa trước, đừng push code vỡ.

## Bước 6 - Push

```bash
git push -u origin HEAD
```

Push xong báo lại: nhánh nào, mấy commit, và link tạo Pull Request nếu nhánh khác `main`.

## Cấm

- `git push --force` lên nhánh chung (`main`, nhánh người khác đang dùng). Cần rewrite thì dùng
  `--force-with-lease` và phải hỏi trước.
- `git commit --amend` cho commit đã push.
- Commit file trong `.gitignore` bằng `-f`.
