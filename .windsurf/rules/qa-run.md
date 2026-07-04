---
trigger: model_decision
description: Use when planning or running a QA cycle, choosing techniques, or signing off a release.
---

# QA Run

Load the full skill body when the trigger matches:
- Skill file: [`qa-run/SKILL.md`](../qa-run/SKILL.md)

## Khi nào áp dụng
- Lên kế hoạch / thực thi chu trình QA
- Chọn kỹ thuật test
- Chạy sanity / regression

## Không dùng
- Viết script automation mới (→ `playwright-pom-automation`)

## Nguyên tắc cốt lõi
> Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.