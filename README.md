# QA-skill

Bộ 3 skill Claude Code cho **QA team**, merge concept từ [anhtester/codex-testing-kit](https://github.com/anhtester/codex-testing-kit) (MIT).

## 3 skill

| Skill | Mục đích | Đầu ra |
|---|---|---|
| [qa-run](./qa-run/SKILL.md) | Săn bug exploratory + log Plane + đóng gói evidence (PDF/Drive) | `FINDINGS.md` + ticket Plane + ảnh |
| [testcase-template](./testcase-template/SKILL.md) | Sinh test case Excel theo template Nina Studio (4 sheet, formulas, dropdowns) | `Template.xlsx` |
| [playwright-pom-automation](./playwright-pom-automation/SKILL.md) | Scaffold & viết Playwright + TS + POM (UI / API / Performance / CI-CD) | `.spec.ts` + `pages/` + `selectors/` + pipeline |

## Cài đặt (máy mới)

```bash
# 1. Clone
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill

# 2. Copy vào ~/.claude/skills/
mkdir -p ~/.claude/skills
for s in qa-run testcase-template playwright-pom-automation; do
  cp -R "$s" ~/.claude/skills/
done

# 3. Cài deps cho qa-run
cd ~/.claude/skills/qa-run && npm install

# 4. Tạo .env cho Plane API trong project bạn test
#    (đặt trong ~/Documents/QA-MDS/<project>/.env)
echo "PLANE_API_KEY=plane_pat_xxx" > ~/Documents/QA-MDS/MyProject/.env
chmod 600 ~/Documents/QA-MDS/MyProject/.env
```

Xem [SETUP-GUIDE.md](./SETUP-GUIDE.md) để biết chi tiết (git config, troubleshooting, bảo mật).

## Nguồn

- Đóng góp từ [anhtester/codex-testing-kit](https://github.com/anhtester/codex-testing-kit) (MIT, 7⭐) — bộ 26 skill cho OpenAI Codex.
- Port sang Claude Code, giữ nguyên concept, viết lại native cho MCP Playwright + Plane API.

## License

MIT — xem [LICENSE](./LICENSE).