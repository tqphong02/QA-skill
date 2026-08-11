---
trigger: model_decision
description: Plane ticket retest triggers integration-plane read then RETEST_PLUS; use for browser QA, sanity, regression, exploratory and UI UX
---

# QA Run

Load the full skill body when the trigger matches:
- Skill file: [`dynamic-testing/web-exploratory/SKILL.md`](../../dynamic-testing/web-exploratory/SKILL.md)

Do not require the user to name this skill. Retest, re-test, verify ticket, or a Plane URL with validation language triggers RETEST_PLUS

Compose internal layers: DISCOVERY_CORE = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX; RETEST_PLUS and SHEET_EXECUTION_PLUS add their required layers on top

## Khi nào áp dụng
- Lên kế hoạch / thực thi chu trình QA
- Chọn kỹ thuật test
- Chạy sanity / regression
- Retest ticket tự chạy RETEST_PLUS gồm Retest, Sanity, Impacted regression, Exploratory, Ad-hoc và UI/UX
- Chạy `scripts/helpers/context-builder.mjs` theo đúng feature scope trước normal browser action; chỉ chạy khi Business Execution Brief là `READY`
- `NEEDS_DISCOVERY` chỉ cho scoped discovery, `BLOCKED` phải dừng đúng trường thiếu; không tự thay flow thiếu bằng flow generic
- Dùng `APP_BASELINE_DISCOVERY` cho lần khám phá tổng thể, còn retest không lặp lại full-app baseline

## Không dùng
- Viết script automation mới (→ `dynamic-web-automation`)

## Nguyên tắc cốt lõi
> Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.
