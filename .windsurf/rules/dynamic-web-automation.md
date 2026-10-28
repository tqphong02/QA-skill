---
trigger: model_decision
description: Use when scaffolding, extending, debugging, or maintaining a Playwright + TypeScript + Page Object Model test project (UI/API/Functional/CI). Also applies when acting as Senior QA Automation Engineer reviewing, analyzing, or adding new automation scenarios.
---

# Playwright POM Automation — Senior QA Automation Engineer

Load the full skill body when the trigger matches:
- Skill file: [`dynamic-testing/web-automation/SKILL.md`](../../dynamic-testing/web-automation/SKILL.md)

## Khi nào áp dụng
- Scaffold dự án Playwright mới
- Viết test UI / API / Functional
- Debug và fix failing tests
- Thêm scenario mới
- Review maintainability của test suite
- Setup CI cho QA project
- Phân tích cấu trúc framework hiện tại

## Không dùng
- Exploratory ad-hoc (dùng `dynamic-web-exploratory` thay thế)
- Selenium/Java (dùng `dynamic-selenium-automation` thay thế)

## Nguyên tắc cốt lõi
> Mọi selector phải đi qua Page Object — không viết `page.locator()` trực tiếp trong spec.
> Đọc code hiện có trước khi viết. Không tạo framework mới nếu đã có sẵn.
> Không sửa test để pass bằng cách bỏ assertion hoặc tăng timeout tùy tiện.
