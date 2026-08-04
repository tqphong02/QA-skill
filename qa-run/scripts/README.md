# QA-Run Scripts Architecture & Registry

Toàn bộ script trong thư mục `qa-run/scripts/` (hơn 55 file) được tổ chức theo kiến trúc **7 nhóm chức năng (Categorized Architecture)** với một lớp **Registry tương thích ngược (`registry.mjs`)**. Kiến trúc này vừa giúp con người dễ dàng duy trì, mở rộng mã nguồn theo domain, vừa đảm bảo các AI agent hoặc hệ thống CI/CD cũ không bị gãy vỡ đường dẫn.

## Run optimization contract

Preparation is portable across projects and hosts:

```bash
node qa-run/scripts/helpers/prepare-test-intelligence.mjs \
  --intent RETEST_TICKET \
  --scope <feature> \
  --run-mode auto \
  --repo <source-repo>
```

Use `fast` for repeated runs, `scoped` for a feature shard and `deep` after a generator, architecture or requirement change. `repo-business-discovery.mjs` defaults to safe parallel independent scanners and accepts `--parallel off` for diagnosis. The preparation card and cache stay under the tested project's `QA_DATA_DIR`

Incremental discovery collects committed, staged, unstaged and untracked changes, selects a conservative impact plan and fails closed when a scanner or canonical artifact fails. Provider-reported model usage is optional and stays outside the bounded card; use `record-model-usage.mjs` with `QA_TOKEN_USAGE_FILE`. A project-specific example belongs under `qa-run/examples/` and is intentionally absent from the generic registry

The `exploratory-runner.mjs` ledger uses this order for UI-first `EXPLORATORY_BROWSER_QA` work (`EXPLORATORY_ADHOC` remains an input alias): `start → rule-plan → page → task-plan → decision → action → rule-probe → coverage → charter → finish`. `start` can create a UI-derived charter when no document, source or saved context exists. For a natural-language/non-deterministic objective, `task-plan` decomposes the live-UI path and `decision` records previous-goal evaluation, compact memory, next goal and one selected action; two repeated no-progress decisions require a bounded replan. `rule-plan` declares hidden-rule hypotheses, `rule-probe` records same-session evidence and `coverage` records the explicit scope boundary. The user-facing final result is only `PASS`, `FAILED`, `N/A` or `UNTEST`; the runner stores technical blocker/partial details internally under the tested project's `evidence/`, never under the skill folder

The first-party native browser path is `native-browser-runtime.mjs` plus `native-browser-daemon.mjs`. It uses the existing Playwright dependency, CDP Accessibility Tree and `runtime-observer.mjs`; it does not use or install Browser Use. Browser sessions and worker evidence remain under the tested project's `evidence/native-browser/<run-id>/`

---

## 1. Bản đồ Kiến trúc 7 Nhóm Thư mục

```
qa-run/scripts/
├── registry.mjs                # Lớp tương thích ngược & phân phối script (Backward Compatibility Layer)
├── README.md                   # Tài liệu bản đồ kiến trúc
│
├── orchestrators/              # [1] Luồng thực thi chính (Được kích hoạt bởi AI / User từ SKILL.md)
│   ├── repo-business-discovery.mjs
│   └── ui-business-reconciliation.mjs
│
├── rbac/                       # [2] Quét, phân tích & kiểm định phân quyền RBAC (Khớp 3 nguồn Req - Code - Runtime)
│   ├── permission-matrix-extractor.mjs
│   ├── rbac-api-tester.mjs
│   ├── ast-domain-model.mjs
│   ├── ast-express-parser.mjs
│   ├── ast-fastify-parser.mjs
│   ├── ast-nestjs-parser.mjs
│   ├── ast-nextjs-parser.mjs
│   ├── ast-permission-parser.mjs
│   ├── ast-route-extractor.mjs
│   ├── ast-state-transition.mjs
│   └── source-indexer.mjs
│
├── discovery/                  # [3] Khám phá & bóc tách quy tắc nghiệp vụ từ mã nguồn / tài liệu
│   └── business-rule-extractor.mjs
│
├── ui-reconciliation/          # [4] Khớp nối UI vs Backend vs BA & sinh bộ câu hỏi Q&A
│   ├── ui-business-reconciler.mjs
│   ├── ambiguity-detector.mjs
│   ├── intent-classifier.mjs
│   ├── observed-flow-builder.mjs
│   ├── qa-generator.mjs
│   └── reconciler-classifier.mjs
│
├── writers/                    # [5] Ghi nhận & xuất tài liệu đầu ra chuẩn hoá (Markdown, XMind, Excel)
│   ├── write-business-guide.mjs
│   ├── write-rbac-matrix.mjs
│   ├── write-ui-business-guide.mjs
│   ├── write-xmind.mjs
│   └── validate-knowledge.mjs
│
├── analysis/                   # [6] Phân tích bề mặt tấn công, an toàn thao tác & rủi ro hệ thống
│   ├── attack-surface.mjs
│   ├── finding-reconciler.mjs
│   ├── health-checker.mjs
│   └── log-analyzer.mjs
│
└── helpers/                    # [7] Tiện ích tự động hoá browser, Google Sheet, Plane, AI & Redaction
    ├── api-health.mjs
    ├── collect-evidence.mjs
    ├── compat.mjs
    ├── context-card.mjs
    ├── context-builder.mjs
    ├── data-factory.mjs
    ├── drive_common.py
    ├── drive_sheet_execute.py
    ├── execute-sheet.mjs
    ├── explore.mjs
    ├── extract-flow.mjs
    ├── fetch-plane-issue.sh
    ├── generate-checklist.mjs
    ├── journey-audit.mjs
    ├── log-bug.mjs
    ├── login.mjs
    ├── run-manifest.mjs
    ├── exploratory-runner.mjs
    ├── native-browser-runtime.mjs
    ├── native-browser-daemon.mjs
    ├── runtime-observer.mjs
    ├── record-model-usage.mjs
    ├── evaluate-business-intelligence.mjs
    ├── validate-host-smoke.mjs
    ├── sweep.mjs
    ├── ux-health.mjs
    ├── visual-audit.mjs
    └── visual-regression.mjs
```

---

## 2. Cơ chế Hoạt động của Registry (`registry.mjs`)

Để đảm bảo tính tương thích với các lệnh CLI cũ hoặc các hàm AI gọi theo tên file ngắn (ví dụ: `runScript('business-rule-extractor.mjs')`), file `registry.mjs` đóng vai trò là điểm điều hướng trung tâm:

### Cấu trúc bảng xạ hình (`SCRIPT_REGISTRY`)
Mỗi script đều có ánh xạ cả dạng có đuôi mở rộng (`.mjs`, `.py`, `.sh`) và không đuôi:
```javascript
export const SCRIPT_REGISTRY = {
  // RBA/AST
  'permission-matrix-extractor.mjs': 'rbac/permission-matrix-extractor.mjs',
  'permission-matrix-extractor': 'rbac/permission-matrix-extractor.mjs',
  
  // UI Reconciliation
  'ui-business-reconciler.mjs': 'ui-reconciliation/ui-business-reconciler.mjs',
  
  // Helpers
  'execute-sheet.mjs': 'helpers/execute-sheet.mjs',
  // ...
};
```

### Hàm gọi script lập trình (`runScript`)
Trong các module orchestrator hoặc script tích hợp, luôn sử dụng `runScript` thay vì `spawnSync` đường dẫn cứng:
```javascript
import { runScript } from '../registry.mjs';

// Gọi bằng tên ngắn (Tự động resolve sang rbac/permission-matrix-extractor.mjs)
const res = runScript('permission-matrix-extractor.mjs', ['--dir', './src']);
```

---

## 3. Hướng dẫn Dành cho AI Agent & Lập trình viên

1. **Khi chạy lệnh từ CLI (Terminal):**
   - Khuyến nghị sử dụng đường dẫn đầy đủ theo domain thư mục mới, ví dụ:
     ```bash
     node qa-run/scripts/orchestrators/repo-business-discovery.mjs --repo . --mode full
     node qa-run/scripts/helpers/execute-sheet.mjs --sheet-url <URL> --module <requested-if-known> --parallel --plan-only
     ```
2. **Khi viết mới hoặc mở rộng script con:**
   - Xác định đúng 1 trong 7 nhóm thư mục phù hợp với domain nghiệp vụ.
   - Thêm file mới vào thư mục đó.
   - **Bắt buộc:** Cập nhật bảng `SCRIPT_REGISTRY` trong `registry.mjs` (cả dạng có đuôi và không đuôi).
3. **Khi kiểm định (Unit Tests):**
   - Toàn bộ suite test đặt tại `qa-run/tests/unit/`. Chạy kiểm định toàn bộ:
     ```bash
     node --test tests/unit/*.spec.mjs
     ```
