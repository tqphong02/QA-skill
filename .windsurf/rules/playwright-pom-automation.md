---
trigger: model_decision
description: Use when scaffolding or extending a Playwright + Page Object Model test project (UI/API/Performance/CI).
---

# Playwright POM Automation

Load the full skill body when the trigger matches:
- Skill file: [`playwright-pom-automation/SKILL.md`](../playwright-pom-automation/SKILL.md)

## Khi nào áp dụng
- Scaffold dự án Playwright mới
- Viết test UI / API / Performance
- Setup CI cho QA project

## Không dùng
- Click exploratory ad-hoc (dùng `qa-run` thay thế)

## Nguyên tắc cốt lõi
> Mọi selector phải đi qua Page Object — không viết `page.locator()` trực tiếp trong spec.