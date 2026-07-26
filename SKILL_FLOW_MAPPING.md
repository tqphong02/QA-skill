# QA-skill — Hướng dẫn Chi tiết Luồng & Mapping giữa 16 Skills

Tài liệu này ghi lại toàn bộ sơ đồ kiến trúc, luồng chuyển giao dữ liệu (Data Handover), router cố định và 6 quy trình thực thi thực tế giữa **16 Skills** trong hệ thống **QA-skill Framework**.

---

## 🎯 1. Triết lý Thiết kế Tinh gọn (Lean QA Architecture)

QA-skill được xây dựng theo kiến trúc tinh gọn (**Lean QA Architecture**):
- **Deterministic Script-First**: Ưu tiên chạy script Node.js / Python / Playwright CLI trực tiếp để tiết kiệm Token và đạt tốc độ thực thi sub-second.
- **Filesystem Knowledge Hub**: Lưu trữ kiến thức dưới dạng Markdown & JSON cục bộ trong `qa-knowledge/` giúp AI đọc lại nhanh và tái sử dụng giữa các phiên làm việc.
- **Single Source of Truth**: Một file JSON duy nhất sinh ra đồng bộ cả XMind, Q&A Markdown và Q&A Excel.

---

## 🗺️ 2. Sơ đồ Luồng Tổng thể (Master Flow Diagram)

```mermaid
flowchart TD
    %% 1. Ingestion & Discovery
    subgraph S1["1. Ingestion & Baseline Discovery"]
        DOC["doc-to-md\n(Convert PDF/DOCX/PPTX sang MD)"]
        DRIVE["google-drive-qa\n(Đọc in-place Docs/Sheets trên Drive)"]
        RBD["qa-run: REPO_BUSINESS_DISCOVERY\n(Quét AST/Regex Source Code -> system-business-guide.md)"]
        UBR["qa-run: UI_BUSINESS_RECONCILIATION\n(So sánh UI vs Backend/BRD -> ui-business-guide.md)"]
        ABD["qa-run: APP_BASELINE_DISCOVERY\n(Crawl routes & UI menu -> app-flow-map.json)"]
    end

    %% 2. Business Analysis & Test Design
    subgraph S2["2. Business Analysis & Test Design"]
        BA["business-analysis\n(Review 18 vùng Senior QA -> XMind & Q&A)"]
        TCT["testcase-template\n(Generator Testcase Markdown -> Excel)"]
    end

    %% 3. Execution & Automation Engine
    subgraph S3["3. Execution Engine & Automation"]
        EX_SHEET["qa-run: SHEET_EXECUTION\n(Chạy testcase tự động từ Google Sheet URL)"]
        EX_EXPLORATORY["qa-run: EXPLORATORY_ADHOC\n(Săn bug ad-hoc, safe mutation, visual audit)"]
        EX_RETEST["qa-run: RETEST_PLUS\n(Retest + Sanity + Regression + UI/UX Audit)"]
        POM_GEN["playwright-pom-automation\n(Sinh code Playwright POM selectors/ & pages/)"]
        POM_EXEC["Playwright Automation Execution\n(Chạy E2E / API Playwright Test)"]
    end

    %% 4. Specialized Testing
    subgraph S4["4. Specialized QA Skills"]
        SEC["pentest-run (Security Assessment)"]
        PERF["performance-qa (internal k6 / JMeter engines)"]
        POSTMAN["postman (MCP Bootstrap & Operations)"]
        API["api-contract-qa (OpenAPI / Swagger)"]
        ACC["accessibility-qa (WCAG / axe-core)"]
        DBQ["data-quality-qa (Database & Schema Drift)"]
        MOB["mobile-qa (Android / iOS)"]
    end

    %% 5. Reporting & Exporters
    subgraph S5["5. Aggregation & Reporting"]
        AGG["qa-run Result Aggregation\n(Tổng hợp Kết quả, Screenshot & Logs)"]
        PLANE["plane-qa\n(Up Comment PASS/FAILED + Evidence -> Đổi Status Ticket)"]
        GH["github-mcp-qa\n(Quản lý PR, Issues & CI Actions)"]
    end

    %% 6. Feedback Loop
    subgraph S6["6. Knowledge Feedback Loop"]
        FB["Update QA Knowledge\n(system-business-guide.md / clarification-qna.json)"]
    end

    %% Data Connections
    DOC & DRIVE & RBD & UBR & ABD --> BA
    BA --> TCT
    TCT --> EX_SHEET
    TCT --> POM_GEN
    POM_GEN --> POM_EXEC
    POSTMAN --> API
    
    EX_SHEET & EX_EXPLORATORY & EX_RETEST & POM_EXEC & S4 --> AGG
    
    AGG --> PLANE
    AGG --> GH
    
    PLANE & GH --> FB
    FB -->|Promote Expected Rules & Mark Testcases Stale| BA
```

---

## 📊 3. Ma trận Chuyển giao giữa 16 Skills (Data Handover Matrix)

| Skill Nguồn (Input) | Luồng Xử lý (Process) | Output Sinh ra (Artifact) | Skill Tiếp nhận (Consumer) | Dữ liệu Chuyển giao |
|:---|:---|:---|:---|:---|
| **`doc-to-md`** | Convert PDF/DOCX/PPTX/HTML sang Markdown | File `.md` chuẩn heading/table | `business-analysis` | Nội dung tài liệu yêu cầu dạng text |
| **`google-drive-qa`** | Đọc/Ghi remote Docs, Sheets, Slides qua MCP | Dữ liệu văn bản / bảng remote | `business-analysis`<br>`qa-run` | SRS/BRD hoặc danh sách Testcase từ Google Drive |
| **`qa-run`** *(REPO_DISCOVERY)* | Quét AST/Regex 14 scripts từ Source Code | `system-business-guide.md`<br>`system-qna.json` | `business-analysis`<br>`qa-run` | Kiến trúc hệ thống, API contracts, State machines, Rules |
| **`qa-run`** *(UI_RECONCILIATION)* | So sánh UI với Code & Docs 13 bước | `ui-business-guide.md`<br>`clarification-qna.json` | `testcase-template`<br>`business-analysis` | Mâu thuẫn UI vs Backend/BRD, Q&A cho BA/PO/Dev |
| **`qa-run`** *(APP_DISCOVERY)* | Crawl routes, menu & components | `app-flow-map.json`<br>`app-business-guide.md` | `qa-run` | Bản đồ bao phủ (Coverage map) toàn bộ ứng dụng |
| **`business-analysis`** | Phân tích Senior QA 18 vùng nghiệp vụ | `analysis.json`<br>`file.xmind`<br>`Q&A MD + Excel` | `testcase-template` | Flow nghiệp vụ đã xác minh, Mindmap & Q&A answers |
| **`testcase-template`** | Generator sinh Testcase | `testcases.md` (trước)<br>`testcases.xlsx` (sau) | `playwright-pom-automation`<br>`qa-run` | Danh sách Testcases chuẩn schema (ID, Steps, Expected) |
| **`playwright-pom-automation`** | Scaffold dự án Playwright POM | `selectors/`, `pages/`, `tests/` | Trình thực thi Playwright | Mã nguồn tự động hóa Playwright E2E / API |
| **`qa-run`** *(SHEET_EXECUTION)* | Đọc Sheet URL & chạy Playwright CLI | Result + Screenshots | `qa-run Aggregation` | Kết quả thực thi testcase hàng loạt từ Google Sheet |
| **`qa-run`** *(RETEST_PLUS)* | Chạy 5 bước retest chuyên sâu | `run-manifest.json`<br>`evidence/` screenshots | `plane-qa` | Trạng thái PASS/FAILED/BLOCKED, evidence screenshot crop |
| **`pentest-run`** | Authorized Security Assessment | `.pentest/engagement.md`<br>Security Findings | `plane-qa`<br>`qa-run Aggregation` | Lỗi bảo mật IDOR, SSRF, SSTI, JWT, GraphQL, Race Condition |
| **`performance-qa`** | Orchestrate Load & Stress bằng internal k6/JMeter adapters | `result.json` + `summary.md/html`<br>File `.jmx` hoặc k6 script | `qa-run Aggregation` | Chỉ số p95/p99 latency, RPS, error rate, bottleneck |
| **`postman`** | Bootstrap OAuth MCP và vận hành Postman resources | MCP connection + verified workspace/collection/spec | `api-contract-qa` | Account, workspace và Postman artifact đã resolve |
| **`api-contract-qa`** | Validate OpenAPI / Swagger / Postman | `contract-report.json` | `qa-run Aggregation` | Sai khác giữa API spec và implementation thực tế |
| **`accessibility-qa`** | Web Accessibility Audit (axe-core / WCAG) | `a11y-report.json` | `qa-run Aggregation` | Lỗi vi phạm WCAG, keyboard focus, screen reader |
| **`data-quality-qa`** | Database ETL & Schema Drift check | `data-drift.json` | `qa-run Aggregation` | Bảng dữ liệu lệch schema, data lineage error |
| **`mobile-qa`** | Appium testing trên Android / iOS | `mobile-report.json` | `qa-run Aggregation` | Kết quả test ứng dụng di động APK / IPA |
| **`plane-qa`** | CRUD Plane Tickets & Comments | Comment retest + Đổi Ticket Status | `github-mcp-qa` | PASS → `Done`, FAILED → `In Progress`, Bug mới → `Todo` |
| **`github-mcp-qa`** | Đọc Git diff/PR, quản lý Issues & Actions | PR Comment + CI Check Status | `qa-run` | Nhận biết changed files để chọn testcases bị ảnh hưởng |

---

## 📋 4. Router Cố định & Quy tắc Kích hoạt (Fixed Router)

| Tín hiệu yêu cầu (User Prompt / Trigger) | Skill được kích hoạt | Hành động đầu tiên của AI Agent |
|:---|:---|:---|
| **Plane URL, Ticket ID, log bug, comment PASS/FAILED/BLOCKED** | `plane-qa` | Parse URL → Chạy `scripts/doctor.sh` → `post-result.py` |
| **Retest, re-test, verify bug/ticket** | `plane-qa` + `qa-run` | Plane doctor/read → Kích hoạt **RETEST_PLUS** (Retest flow gốc + Sanity + Impacted Regression + Exploratory + UI/UX Audit) |
| **"Test thử trang này, chưa có testcase..." / Săn bug ad-hoc** | `qa-run: EXPLORATORY_ADHOC` | Đọc knowledge có sẵn → Sinh dynamic checklist → Safe mutation → Visual audit → Log bug |
| **"Học toàn bộ web app này..." / Bootstrap app baseline** | `qa-run: APP_BASELINE_DISCOVERY` | Quét menu, route, API → Lưu `app-flow-map.json` & `app-business-guide.md` với `coverage_map` |
| **Chạy execution testcase từ Google Sheet URL** | `qa-run: SHEET_EXECUTION` | Chạy `execute-sheet.mjs --parallel` → Thực thi Playwright → Ghi kết quả + screenshot vào Sheet |
| **Phân tích repo, học business flow từ source code** | `qa-run: REPO_BUSINESS_DISCOVERY` | Chạy `repo-business-discovery.mjs --repo <path> --mode full` → Merge vào `system-business-guide.md` & `system-qna.json` |
| **Từ UI suy ra flow, đối chiếu Code + Docs + Runtime, tìm mâu thuẫn** | `qa-run: UI_BUSINESS_RECONCILIATION` | Chạy `ui-business-reconciliation.mjs --page <slug>` → Phân loại 9 kết quả, 10 ambiguity patterns → Xuất `ui-business-guide.md` & `clarification-qna.json` |
| **Viết/sửa/review testcase, Scenario ID/Name** | `testcase-template` | Đọc testcase Markdown cũ nếu có → Generator tạo Markdown trước, Excel sau |
| **Viết Playwright automation / POM code (`selectors/`, `pages/`)** | `playwright-pom-automation` | Đọc template POM → Scaffold cấu trúc `selectors/`, `pages/`, `tests/` |
| **Phân tích BRD/SRS, dựng flow hệ thống, tạo XMind hoặc Q&A** | `business-analysis` (+ `doc-to-md` khi nguồn chưa là MD) | Convert đính kèm sang MD → Review 18 vùng Senior QA → Generate XMind + Q&A Markdown + Q&A Excel |
| **Pentest được ủy quyền, security assessment, IDOR, SSRF, JWT...** | `pentest-run` | Đọc `.pentest/engagement.md` → Chạy `scripts/doctor.sh` trước request mạng |
| **Performance, load, stress test, k6, JMeter, `.jmx`, JTL, Chrome DevTools** | `performance-qa` | Xác nhận common workload contract → chọn internal engine → smoke một user → approved load |
| **Postman setup, MCP, OAuth, workspace, collection, environment, spec, mock hoặc monitor** | `postman` | Chạy bootstrap idempotent → OAuth → smoke test workspace read-only |
| **OpenAPI, Swagger, Postman contract validation** | `api-contract-qa` | Validate spec đối chiếu với implementation thực tế |
| **WCAG, axe-core, keyboard access, screen reader** | `accessibility-qa` | Kết hợp automated scan với manual interaction |
| **ETL/ELT, reconciliation, database schema drift** | `data-quality-qa` | Xác nhận nguồn/đích & read-only boundary tại DB role |

---

## 🛠️ 5. Chi tiết 6 Quy trình Thực tế (End-to-End Use Cases)

### 1️⃣ Flow 1: System Baseline Discovery (Học Hệ thống từ Source Code)
```text
Source Code Repository
  └─► qa-run (REPO_BUSINESS_DISCOVERY)
       ├─► 14 AST & Regex Extractor Scripts
       ├─► Trích xuất: API Contracts, State Machines, Permission Matrix, Domain ERD, Business Rules
       └─► Merge xuất ra: qa-knowledge/merged/system-business-guide.md & system-qna.json
```

### 2️⃣ Flow 2: UI Business Reconciliation (Phân tích Mâu thuẫn UI vs Backend/BRD)
```text
Live Page URL / DOM Snapshot
  └─► qa-run (UI_BUSINESS_RECONCILIATION)
       ├─► Step 1: Component Extraction (data-testid > aria-label > role + name > id > CSS)
       ├─► Step 2: Region Segmentation (Header, Sidebar, Toolbar, Form, Table, Modal)
       ├─► Step 3: Safe Multi-State Explorer (Action Safety Guard, Normalized State Hash)
       ├─► Step 4: Runtime Transition Verifier (Reload persistence check, Redaction)
       ├─► Step 5: 3-Angle Reconciliation (Actual UI vs Implemented Code vs Expected BRD)
       ├─► Step 6: 10 Ambiguity Patterns & Clarification Q&A Lifecycle
       └─► Output: ui-business-guide.md & clarification-qna.json
```

### 3️⃣ Flow 3: Requirements to Testcase & XMind (Tài liệu -> Mindmap & Testcases)
```text
File SRS/BRD (PDF/Drive)
  └─► doc-to-md / google-drive-qa
       └─► business-analysis (Review 18 vùng Senior QA)
            ├─► Sinh file JSON trung tâm: analysis.json
            └─► Chạy generate.sh sinh 3 output đồng bộ 100%:
                 ├── 1. file.xmind (Sơ đồ tư duy editable + Mũi tên liên kết thực)
                 ├── 2. clarification-qna.md (Bảng Q&A cho AI/QA đọc)
                 └── 3. clarification-qna.xlsx (File Excel gửi BA/PO điền trả lời)
            └─► testcase-template (Sinh testcases.md & testcases.xlsx)
```

### 4️⃣ Flow 4: Google Sheet Test Execution (Chạy Test từ Sheet URL)
```text
Google Sheet URL chứa Testcases
  └─► qa-run (SHEET_EXECUTION)
       ├─► Chạy execute-sheet.mjs --parallel
       ├─► Trình duyệt Playwright đọc các bước action & expected result
       ├─► Bắt Screenshot Evidence cho mỗi bước
       └─► Cập nhật trực tiếp trạng thái PASS / FAILED kèm link ảnh vào Google Sheet
```

### 5️⃣ Flow 5: Retest Bug Lifecycle (`RETEST_PLUS` -> Plane Update)
```text
Nhận Ticket URL (Plane)
  └─► plane-qa (Parse URL -> Doctor check quyền)
       └─► qa-run (RETEST_PLUS)
            ├── 1. Retest flow gốc gây ra lỗi
            ├── 2. Smoke/Sanity check các tính năng xung quanh
            ├── 3. Impacted Regression (Kiểm tra vùng ảnh hưởng)
            ├── 4. Exploratory & Ad-hoc (Săn bug ngoài flow)
            └── 5. UI/UX Visual Audit (Soi lệch layout / CSS)
       └─► plane-qa (Post Result & Evidence)
            ├── PASS   ──► Đổi trạng thái Ticket sang "Done" + Comment bằng chứng
            ├── FAILED ──► Đổi trạng thái Ticket sang "In Progress" + Comment lỗi
            └── BLOCKED ─► Giữ nguyên trạng thái + Comment lý do bị kẹt
```

### 6️⃣ Flow 6: Playwright POM Automation Engineering
```text
testcases.md (Bộ testcases chuẩn)
  └─► playwright-pom-automation
       ├─► Tách selectors đặt vào selectors/<page>.json
       ├─► Viết Page Object class vào pages/<page>.page.mjs
       ├─► Tạo test spec vào tests/<feature>.spec.mjs (gắn tag @ui, @api, @functional)
       └─► Thực thi tự động qua Playwright Test Runner & wire Allure report
```

---

## 🗄️ 6. Cấu trúc Thư mục Knowledge (`qa-knowledge/`)

Tất cả kiến thức thu thập được lưu giữ nhất quán dưới dạng **Markdown & JSON**:

```text
qa-knowledge/
  ├── merged/
  │   ├── system-business-guide.md   # Hợp nhất toàn bộ kiến trúc & rules từ Source Code
  │   └── system-qna.json             # Bộ Q&A trích xuất từ source code
  ├── ui-business/                    # Kết quả phân tích UI vs Backend/BRD theo từng trang
  │   └── <page-slug>/
  │       ├── ui-business-guide.md    # Hướng dẫn nghiệp vụ UI 12 phần
  │       ├── business-conflicts.json # Danh sách mâu thuẫn & deep evidence bundle
  │       ├── transition-evidence.json# Bằng chứng transition & reload persistence
  │       ├── clarification-qna.json  # Câu hỏi Q&A phân định BA/PO/Dev
  │       └── ui-state-graph.json     # Sơ đồ chuyển trạng thái UI đã mã hóa
  ├── app-business-guide.md           # Baseline coverage map tổng thể ứng dụng
  ├── testcases/                      # File Testcase Markdown & Excel
  └── evidence/                       # Screenshots crop & network logs theo phiên test
```

---

## 🔄 7. Vòng Phản hồi Tinh gọn (Simple Knowledge Feedback Loop)

```text
QA phát hiện Rule nghiệp vụ mới / Mâu thuẫn UI
  │
  ▼
clarification-qna.json (Tạo Q&A với SHA256 Fingerprint)
  │
  ▼
BA / PO xác nhận trả lời (Chuyển status -> ACCEPTED)
  │
  ▼
Update QA Knowledge:
  ├─► Promote câu trả lời thành Expected Rule vào resolved-business-rules.json
  ├─► Cập nhật system-business-guide.md & ui-business-guide.md
  └─► Đánh dấu STALE trên các testcases liên quan → Tự động sinh lại Testcase Excel/Markdown chuẩn nhất
```

---

## 🧠 8. Cơ chế Caching Memory & Phân tích Tiêu thụ Token (Token Optimization)

### 💡 Nguyên lý Caching Memory cho AI Agent
Sau khi chạy bất kỳ sub-pipeline nào của `qa-run` (`REPO_BUSINESS_DISCOVERY`, `UI_BUSINESS_RECONCILIATION`, hay `APP_BASELINE_DISCOVERY`), toàn bộ thông tin tính năng, API contracts, state transitions và rules sẽ được lưu tự động vào `qa-knowledge/`.

Lần làm việc tiếp theo:
- **KHÔNG đọc lại toàn bộ đống Source Code / Raw PDF / Full HTML DOM** (~100,000+ Tokens).
- **CHỈ ĐỌC file Memory ngắn gọn trong `qa-knowledge/`** (`system-business-guide.md` hoặc `ui-business-guide.md` ~1,500 - 2,500 Tokens).
- 👉 **Tiết kiệm tới ~98% Token tiêu thụ** cho mỗi lần retest hoặc thiết kế testcase mới.

---

### 🚨 Phân loại & Xếp hạng 4 Luồng Tốn Token Nhiều Nhất

#### 🔴 Top 4 Luồng Tốn Token Nhiều Nhất (High Token Cost — Cần Hạn chế / Dùng Engine Tối ưu)

| Hạng | Luồng Thao tác QA | Chi phí Chưa tối ưu (Raw Prompting) | Nguyên nhân Ngốn Token | Giải pháp Engine Tối ưu Đã Triển khai | Chi phí Sau Tối ưu (Level 0-2) | Mức Tiết kiệm |
|:---:|:---|:---:|:---|:---|:---:|:---:|
| 🥇 **TOP 1** | **Phân tích Source Code trực tiếp bằng AI Prompt** | **80,000 – 150,000 Tokens/lần** | Nạp hàng chục nghìn dòng code thô trực tiếp vào Context Window | **Probe CLI** (`@probelabs/probe`) + **ast-grep** + **Understand-Anything** trích xuất `context-pack.json` | **1,500 – 3,000 Tokens** | 📉 **Giảm ~98%** |
| 🥈 **TOP 2** | **Full-App Re-discovery nhiều lần trong các Retest nhỏ** | **50,000 – 90,000 Tokens/lần** | Quét lại toàn bộ ứng dụng nhiều lần từ đầu cho mỗi ticket retest | **`incremental-discovery.mjs`** + **SCIP** chỉ quét đúng module & changed symbols bị ảnh hưởng | **1,000 – 4,000 Tokens** | 📉 **Giảm ~95%** |
| 🥉 **TOP 3** | **Đưa Raw Full HTML DOM / Full Screenshot 4K vào AI Vision** | **30,000 – 60,000 Tokens/lần** | Gửi nguyên cây DOM thô hoặc ảnh 4K full-page cho Vision LLM API | **`dom-pruner.mjs`** (Playwright Scoped ARIA Snapshot) + **OmniParser Bounding Boxes** (0 Vision Token) | **0 – 1,000 Tokens** *(Chỉ crop vùng lỗi)* | 📉 **Giảm ~93–100%** |
| 🏅 **TOP 4** | **Parse PDF / DOCX thô chưa qua Indexing** | **20,000 – 50,000 Tokens/lần** | Nạp file nhị phân lớn hoặc văn bản chưa qua lọc định dạng | **Docling** + **`doc-indexer.mjs`** + **SQLite FTS** chỉ trích xuất 3–5 Section liên quan tới feature | **1,500 – 4,000 Tokens** | 📉 **Giảm ~90%** |

---

#### 🟢 Các Luồng Siêu Tiết kiệm Token / Zero-Token (Low / 0 Token Cost — Ưu tiên Hàng đầu)
1. **Chạy Script Trích xuất Deterministic Node.js / Python CLI (`0 Token AI`)**:
   - `repo-business-discovery.mjs`: ast-grep & AST Scanners trích xuất API & ERD tự động.
   - `visual-evidence-router.mjs`: Microsoft OmniParser phân tích Bounding Boxes cục bộ (`omni-parsed-boxes.json`).
   - `execute-sheet.mjs`: Thực thi kịch bản testcase tự động qua Playwright CLI.
2. **Đọc File Caching Memory từ `qa-knowledge/` (`~1,500 Tokens`)**:
   - Đọc `system-business-guide.md` và `ui-business-guide.md` đã tóm tắt 12 phần chuẩn.
3. **Targeted Visual Evidence Cropping (`~500 - 1,000 Tokens`)**:
   - Chỉ cắt đúng vùng component bị conflict gửi cho AI Vision khi DOM audit phát hiện mâu thuẫn.
4. **Q&A Fingerprint & State Hash Lookup (`0 Token AI`)**:
   - Dùng hash SHA-256 để tra cứu nhanh Q&A đã được BA/PO duyệt mà không hỏi lại AI.

---

### 🚨 Điều kiện Nghiệm thu Token Optimization Engine:
- [ ] Không gửi Full DOM thô mặc định cho AI (chỉ dùng Playwright Scoped ARIA Snapshot / `dom-pruner.mjs`).
- [ ] Không gửi toàn bộ Source Code repository cho AI (chỉ gửi Context Pack do Probe / AST-grep trích xuất).
- [ ] Tài liệu chỉ lấy đúng Section liên quan đến tính năng đang test (qua Docling & `doc-indexer.mjs`).
- [ ] Ảnh AI Vision chỉ gửi vùng crop bị nghi ngờ / conflict (`visual-evidence-router.mjs`).
- [ ] Repo không thay đổi bắt buộc dùng Cache (`artifact-cache.mjs`).
- [ ] Retest ticket chỉ scan module bị ảnh hưởng (`incremental-discovery.mjs` + SCIP).
- [ ] Context vượt Budget phải tự cắt gọt và ghi rõ phần đã loại bỏ (`token-budget-manager.mjs`).
- [ ] Mọi Fallback lên Level cao hơn phải có lý do ghi rõ trong `token-usage.json`.

---

## ⚡ 9. Kiến trúc Tối ưu Token 5 Cấp độ (5-Level Token Optimization Architecture)

### 📐 Nguyên tắc Vận hành Tối ưu Token
```text
Script xử lý trước (Level 0)
    ↓
Chỉ lấy phần thay đổi hoặc có rủi ro (Incremental Scan via SCIP & git diff)
    ↓
AI chỉ đọc Context đã rút gọn (Context Pack via Probe & ast-grep)
    ↓
Screenshot chỉ dùng khi DOM audit không đủ kết luận (Cropped Vision via OmniParser Fallback)
```

---

### 📶 Mô hình Xử lý Phân tầng 5 Cấp độ (5-Level Layered Processing Model)

```mermaid
flowchart TD
    L0["Level 0: Deterministic Script (0 AI Token)\n• AST/ast-grep Scanners, SCIP, Playwright CLI & Probe CLI"] --> L1
    L1["Level 1: AI đọc JSON Tóm lược (1k - 3k Tokens)\n• context-pack.json & dom-pruner output"] --> L2
    L2["Level 2: AI đọc Code / Document theo Đoạn nhỏ (2k - 5k Tokens)\n• doc-indexer sections & Probe CLI scoped symbols"] --> L3
    L3["Level 3: AI Vision xem Ảnh Crop (500 - 1k Tokens)\n• visual-evidence-router cropped region images"] --> L4
    L4["Level 4: Scoped Module Fallback (Repomix Compressed XML)\n• Giới hạn theo Scope Module/Symbol, tuyệt đối không dump full repo"]
```

- **Level 0**: Script deterministic hoàn toàn, **0 AI token** (dùng `ast-grep`, `SCIP`, `Probe CLI`, Playwright CLI).
- **Level 1**: AI đọc JSON tóm lược (`context-pack.json` & `dom-pruner.mjs` output).
- **Level 2**: AI chỉ đọc code hoặc tài liệu theo đoạn nhỏ (`doc-indexer.mjs` sections & Probe AST snippets).
- **Level 3**: AI Vision xem ảnh crop của component bị lỗi (`visual-evidence-router.mjs`). Giới hạn theo số ảnh crop, kích thước vùng crop và số lần gọi Vision API.
- **Level 4**: Scoped Module Fallback (`Repomix --compress` theo module) — Vẫn giới hạn phạm vi theo Module / Symbol boundary ngay cả khi fallback, **tuyệt đối không dump toàn bộ source code repository**.

---

### 🛠️ Bộ Công cụ Open Source Tối ưu Token Tích hợp Engine

```text
Source Code
├── ast-grep              (Trích business rules bằng YAML AST structural patterns - 0 token)
├── SCIP (scip-typescript) (Truy vết cross-file impact giữa Controller -> Service -> Repo)
├── Probe (@probelabs/probe)(Tìm kiếm ngữ nghĩa code, lấy context function/class có budget --max-tokens)
├── Understand Anything   (Chỉ dùng semantic business analysis khi cần ở setup/full scan)
└── Repomix               (Fallback nén code XML theo module cho Level 4)

Web UI
├── Playwright ARIA Snapshot (Scoped snapshot theo element #order-form với depth 4)
├── dom-pruner.mjs        (Rút gọn DOM thô thành Business Components JSON)
└── OmniParser            (Chỉ dùng làm visual fallback cho Canvas / WebGL / Obfuscated UI)

Documents
├── Docling               (Convert PDF/DOCX/PPTX giữ nguyên layout/table)
├── doc-indexer.mjs       (Indexing & Filter Section tài liệu)
└── SQLite FTS            (Tìm kiếm section tài liệu liên quan đến feature)
```

---

### 🛠️ Bộ 7 Script Hỗ trợ Tối ưu Token (`qa-run/scripts/`) & Cache Key Versioning

1. **`artifact-cache.mjs`**: Cache kết quả trích xuất dựa trên phiên bản tổng hợp:
   `CacheKey = MD5(commitHash | fileContentHash | inputHash | parserVersion | adapterVersion | knowledgeSchemaVersion)`
   *(Tránh trường hợp dùng lại cache cũ sai cấu trúc schema).*
5. **`visual-evidence-router.mjs`**: Tự động tích hợp **Microsoft OmniParser** (Screen Parsing Model) để phân tích bounding box của các phần tử giao diện cục bộ (Local Model):
   - Chạy OmniParser phân tích ảnh screenshot thành danh sách cấu trúc JSON chứa tọa độ `[x1, y1, x2, y2]` và nhãn phần tử tương tác (`button`, `input`, `badge`, `menu`).
   - Chuyển đổi toàn bộ giao diện thị giác thành **Dữ liệu JSON Nguồn thấp (0 LLM Vision Token)**.
   - Chỉ crop đúng vùng patch nghi ngờ gửi cho LLM Vision API khi OmniParser hoặc DOM audit phát hiện mâu thuẫn.
6. **`incremental-discovery.mjs`**: Chỉ scan lại các route, module hoặc source file có sự thay đổi (dựa trên hash).
7. **`token-budget-manager.mjs`**: Quản lý và kiểm soát Budget Token per Intent bằng Tokenizer thật.
   - Budget Config: `RETEST_TICKET`: 8k, `EXPLORATORY_ADHOC`: 12k, `UI_BUSINESS_RECONCILIATION`: 15k, `REPO_BUSINESS_DISCOVERY`: 20k.
   - Khi vượt budget: Tự động loại duplicate -> Bỏ phần confidence thấp -> Giữ High Risk -> Ghi phần đã cắt bớt.

---

### 📊 File Đo Lường Hiệu quả Token (`qa-knowledge/metrics/token-usage.json`)

Mọi phiên test tự động ghi nhận chỉ số thực tế để làm cơ sở benchmark:

```json
{
  "intent": "UI_BUSINESS_RECONCILIATION",
  "rawEstimatedTokens": 42000,
  "finalContextTokens": 4800,
  "cacheHit": true,
  "documentsRetrieved": 3,
  "screenshotsSent": 2,
  "fullPageVisionUsed": false,
  "fallbackLevel": 3,
  "recordedAt": "2026-07-24T00:05:00.000Z"
}
```

---

### 🚦 Thứ tự Triển khai & Điều kiện Nghiệm thu Token Optimization Engine

#### Thứ tự Triển khai 7 Scripts:
```text
1. artifact-cache.mjs          (Cache key versioning & Hash check)
2. dom-pruner.mjs              (Rút gọn DOM thành Business Components)
3. doc-indexer.mjs             (Indexing & Filter Section tài liệu)
4. incremental-discovery.mjs   (Scan theo module/route hash thay đổi)
5. context-builder.mjs         (Tạo và validate Business Execution Brief theo scope)
6. visual-evidence-router.mjs  (Điều phối crop ảnh nghi ngờ cho Vision)
7. token-budget-manager.mjs    (Token budget guard & Real tokenizer metric)
```

#### Điều kiện Nghiệm thu:
- [x] Không gửi Full DOM thô mặc định cho AI.
- [x] Không gửi toàn bộ Source Code repository cho AI.
- [x] Tài liệu chỉ lấy đúng Section liên quan đến tính năng đang test.
- [x] Ảnh AI Vision chỉ gửi vùng crop bị nghi ngờ / conflict.
- [x] Repo không thay đổi bắt buộc dùng Cache.
- [x] Retest ticket chỉ scan module bị ảnh hưởng (Incremental).
- [x] Context vượt Budget phải tự cắt gọt và ghi rõ phần đã loại bỏ.
- [x] Mọi Fallback lên Level cao hơn phải có lý do ghi rõ trong `token-usage.json`.

---

## ⚡ 9. Kiến trúc Tối ưu Token 5 Cấp độ (5-Level Token Optimization Architecture)

### 📐 Nguyên tắc Vận hành Tối ưu Token
```text
Script xử lý trước (Level 0)
    ↓
Chỉ lấy phần thay đổi hoặc có rủi ro (Incremental)
    ↓
AI chỉ đọc Business Execution Brief đã validate
    ↓
Screenshot chỉ dùng khi DOM audit không đủ kết luận (Cropped Vision)
```

---

### 📶 Mô hình Xử lý Phân tầng 5 Cấp độ (5-Level Layered Processing Model)

```mermaid
flowchart TD
    L0["Level 0: Deterministic Script (0 AI Token)\n• AST/Regex Scanners & Playwright CLI Execution"] --> L1
    L1["Level 1: AI đọc JSON Tóm lược (1k - 3k Tokens)\n• business-execution-brief.json & dom-pruner output"] --> L2
    L2["Level 2: AI đọc Code / Document theo Đoạn nhỏ (2k - 5k Tokens)\n• doc-indexer sections & changed symbols"] --> L3
    L3["Level 3: AI Vision xem Ảnh Crop (500 - 1k Tokens)\n• visual-evidence-router cropped region images"] --> L4
    L4["Level 4: Full Screenshot / Full Source Code\n• Chỉ dùng khi Level 0 - Level 3 bị FAIL"]
```

- **Level 0**: Script deterministic hoàn toàn, **0 AI token**.
- **Level 1**: AI đọc JSON tóm lược (`business-execution-brief.json` & `dom-pruner.mjs` output).
- **Level 2**: AI chỉ đọc code hoặc tài liệu theo đoạn nhỏ (`doc-indexer.mjs` sections).
- **Level 3**: AI Vision xem ảnh crop của component bị lỗi (`visual-evidence-router.mjs`).
- **Level 4**: Full screenshot hoặc full source code **CHỈ KHI THỰC SỰ CẦN THIẾT**.

---

### 🛠️ Bộ Script Hỗ trợ Tối ưu Token (`qa-run/scripts/`)

1. **`artifact-cache.mjs`**: Cache kết quả trích xuất theo commit hash, file content hash và input hash. Nếu file không đổi, không phân tích lại.
2. **`context-builder.mjs`**: Nhận Intent & feature scope, đọc knowledge thực tế, tạo `business-execution-brief.json` và trả `READY`, `NEEDS_DISCOVERY` hoặc `BLOCKED`; không sinh flow fallback.
3. **`dom-pruner.mjs`**: Rút gọn cây DOM thô thành danh sách business components ngắn gọn (loại bỏ script, style, svg paths, class dài, hidden elements).
4. **`doc-indexer.mjs`**: Chia nhỏ tài liệu PDF/DOCX theo section index, chỉ cung cấp đúng section liên quan tới feature đang test.
5. **`visual-evidence-router.mjs`**: Tự động quyết định vùng visual nào thực sự cần gửi cho AI Vision (chỉ crop region khi DOM audit nghi ngờ).
6. **`incremental-discovery.mjs`**: Chỉ scan lại các route, module hoặc source file có sự thay đổi (dựa trên hash).
7. **`token-budget-manager.mjs`**: Quản lý và kiểm soát Budget Token per Intent (`RETEST_TICKET`: 8k, `EXPLORATORY_ADHOC`: 12k, `UI_BUSINESS_RECONCILIATION`: 15k, `REPO_BUSINESS_DISCOVERY`: 20k).

---

### 📊 So sánh Hiệu quả Tiêu thụ Token Chi tiết

| Luồng Xử lý | Chưa tối ưu (Raw Execution) | Sau khi tối ưu (Pruned + Cached) | Mức Tiết kiệm |
|:---|:---:|:---:|:---:|
| **Source Code Analysis** | 80,000 – 150,000 Tokens | **2,000 – 8,000 Tokens** | 📉 **Mục tiêu Giảm ~95%** |
| **Raw DOM & Screenshots** | 30,000 – 60,000 Tokens | **1,000 – 5,000 Tokens** | 📉 **Mục tiêu Giảm ~93%** |
| **Tài liệu PDF / DOCX** | 20,000 – 50,000 Tokens | **2,000 – 6,000 Tokens** | 📉 **Mục tiêu Giảm ~90%** |
| **App Re-discovery** | ~50,000 Tokens | **1,000 – 10,000 Tokens** | 📉 **Mục tiêu Giảm ~90%** |

---

## 🔗 10. Mapping Chi tiết 2 Vendor Engine Mới (OmniParser & Understand-Anything)

### 📦 1. Microsoft OmniParser (`qa-run/vendor/OmniParser`)
- **Vai trò**: Trích xuất Bounding Boxes & Tọa độ giao diện thị giác cục bộ (Local GUI Grounding), Phân tích Tĩnh Web UI (Static UI Audit) & **Kiểm thử UI/UX Visual (UI/UX Visual Audit)**.
- **Mapping với Các Skill**:
  - 🟢 **`qa-run`** (`visual-evidence-router.mjs` & `journey-audit.mjs`): Chuyển ảnh screenshot thành dữ liệu JSON cấu trúc `[x1, y1, x2, y2]`. Tự động thực hiện **UI/UX Audit**:
    - **Visual Overlap**: Phát hiện các nút bấm, text hoặc icon bị đè/chèn lên nhau (Overlap Bounding Boxes).
    - **Touch Target & Spacing**: Kiểm tra kích thước nút bấm có bị quá nhỏ (< 32px height) hoặc khoảng cách margin/padding không đều.
    - **Cognitive Load Warning**: Cảnh báo khi mật độ phần tử tương tác trên 1 màn hình quá rối mắt (> 40 visual boxes).
    - **Static Q&A Export**: Tự động xuất ra file **`clarification-qna.md`** chỉ ra mâu thuẫn Visual Hierarchy cho PO/UI-UX Designer.
  - 🟢 **`accessibility-qa`**: Đối chiếu danh sách Bounding Boxes của OmniParser với cây DOM Accessibility Tree để phát hiện nút bấm/icon có hiển thị nhưng bị thiếu thuộc tính `aria-label`.
  - 🟢 **`playwright-pom-automation`**: Định vị vị trí nút bấm / phần tử trên màn hình khi DOM bị mã hóa obfuscated hoặc vẽ qua Canvas / WebGL.

---

  - 🟢 **`testcase-template`**: Đọc danh mục DTO & State Transitions từ Understand-Anything để sinh testcase kiểm thử biên & chuyển trạng thái.
  - 🟢 **`api-contract-qa`**: Đối chiếu định nghĩa API trích xuất bởi Understand-Anything với file OpenAPI / Postman spec.

---

## 🗂️ 11. Chi tiết Danh mục & Mối liên hệ Trực tiếp giữa Tất cả 16 Skills

### 1️⃣ `qa-run` (Core Execution Engine & Knowledge Hub)
- **Đường dẫn**: `qa-run/SKILL.md`
- **Mục đích**: Trái tim thực thi của hệ thống QA. Chạy baseline discovery, retest bug (`RETEST_PLUS`), exploratory testing, UI business reconciliation, visual audit & sheet execution.
- **Inputs**: Source code, URL trang web, Google Sheet URL, Plane ticket ID, `qa-knowledge/`.
- **Outputs**: `system-business-guide.md`, `ui-business-guide.md`, `run-manifest.json`, Screenshots evidence, `context-pack.json`.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `doc-to-md` (tài liệu), `google-drive-qa` (SRS trên Drive), `qa-vendor/Understand-Anything` & `qa-vendor/OmniParser`.
  - 📤 **Chuyển dữ liệu tới**: `business-analysis` (system guide), `testcase-template` (flow rules), `plane-qa` (retest results & evidence), `github-mcp-qa` (PR check).

---

### 2️⃣ `testcase-template` (Testcase Generator & Standardizer)
- **Đường dẫn**: `testcase-template/SKILL.md`
- **Mục đích**: Sinh và chuẩn hóa tài liệu Testcase dạng Markdown (trước) và Excel (sau) tuân thủ schema cột cố định.
- **Inputs**: Flows & rules từ `business-analysis`, `system-business-guide.md`, `ui-business-guide.md`, `context-pack.json`.
- **Outputs**: `testcases.md`, `testcases.xlsx` (4 sheets, formulas, dropdowns, clean formatting).
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `business-analysis` & `qa-run`.
  - 📤 **Chuyển dữ liệu tới**: `playwright-pom-automation` (dùng để sinh code POM), `qa-run: SHEET_EXECUTION` (chạy testcase tự động).

---

### 3️⃣ `playwright-pom-automation` (Automation Engineering Scaffold)
- **Đường dẫn**: `playwright-pom-automation/SKILL.md`
- **Mục đích**: Quy hoạch dự án tự động hóa Playwright theo Page Object Model (POM). Tách selector khỏi spec test.
- **Inputs**: Kịch bản testcase từ `testcase-template`.
- **Outputs**: `selectors/<page>.json`, `pages/<page>.page.mjs`, `tests/<feature>.spec.mjs`.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `testcase-template` & OmniParser (định vị phần tử khi DOM mã hóa).
  - 📤 **Chuyển dữ liệu tới**: Trình thực thi Playwright Test Runner → `qa-run Result Aggregation`.

---

### 4️⃣ `doc-to-md` (Document Converter Engine)
- **Đường dẫn**: `doc-to-md/SKILL.md`
- **Mục đích**: Chuyển đổi các file tài liệu thô cục bộ (PDF, DOCX, PPTX, XLSX, HTML, Images) sang Markdown chuẩn.
- **Inputs**: File nhị phân local.
- **Outputs**: File `.md` giữ nguyên cấu trúc heading, table và code blocks.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: File local hoặc chat upload.
  - 📤 **Chuyển dữ liệu tới**: `business-analysis` & `doc-indexer.mjs` (trích xuất section).

---

### 5️⃣ `business-analysis` (Senior QA Requirements & System Flow Analyzer)
- **Đường dẫn**: `business-analysis/SKILL.md`
- **Mục đích**: Phân tích tài liệu nghiệp vụ theo góc nhìn Senior Fullstack QA/QC rà soát 18 vùng kiểm thử.
- **Inputs**: Markdown từ `doc-to-md`, Docs trên `google-drive-qa`, `system-business-guide.md` từ `qa-run`.
- **Outputs**: `analysis.json`, file `.xmind` (sơ đồ tư duy), `clarification-qna.md` và `clarification-qna.xlsx`.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `doc-to-md`, `google-drive-qa`, `qa-run`.
  - 📤 **Chuyển dữ liệu tới**: `testcase-template` (chốt flow & rules để sinh testcases).

---

### 6️⃣ `pentest-run` (Authorized Security Assessment & Bug Bounty)
- **Đường dẫn**: `pentest-run/SKILL.md`
- **Mục đích**: Điều phối pentest được ủy quyền, kiểm tra rủi ro bảo mật (IDOR, SSRF, SSTI, JWT, GraphQL, Race condition).
- **Inputs**: Phê duyệt ủy quyền `.pentest/engagement.md`, target URL / API endpoints.
- **Outputs**: Báo cáo lỗ hổng `findings.md`, chứng cứ tái hiện `evidence/`.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `api-contract-qa` & `qa-run`.
  - 📤 **Chuyển dữ liệu tới**: `plane-qa` (log bug bảo mật mức High/Critical) & `qa-run Aggregation`.

---

### 7️⃣ `plane-qa` (Issue Tracker Integration & Bug Lifecycle Manager)
- **Đường dẫn**: `plane-qa/SKILL.md`
- **Mục đích**: CRUD ticket trên Plane API, log bug chuẩn template, comment kết quả retest PASS/FAILED/BLOCKED kèm ảnh bằng chứng inline.
- **Inputs**: Ticket URL, kết quả test từ `qa-run`, `pentest-run` hoặc specialized skills.
- **Outputs**: Ticket status đã cập nhật (`Done`, `In Progress`, `Todo`), inline retest comments.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `qa-run`, `pentest-run`, `performance-qa`, `accessibility-qa`.
  - 📤 **Chuyển dữ liệu tới**: `github-mcp-qa` (sync trạng thái bug với CI/CD PR).

---

### 8️⃣ `google-drive-qa` (In-Place Drive MCP Integration)
- **Đường dẫn**: `google-drive-qa/SKILL.md`
- **Mục đích**: Đọc/Ghi/Cập nhật tài liệu Google Drive, Docs, Sheets, Slides trực tiếp qua MCP mà không cần tải file về đĩa local.
- **Inputs**: Google Drive URL hoặc File ID.
- **Outputs**: Nội dung văn bản Docs, bảng tính Sheets, báo cáo Slides remote.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: Link người dùng cung cấp hoặc kết quả test từ `qa-run`.
  - 📤 **Chuyển dữ liệu tới**: `business-analysis` (đọc SRS remote) & `qa-run` (ghi kết quả test).

---

### 9️⃣ `data-quality-qa` (Database, ETL & Schema Drift QA)
- **Đường dẫn**: `data-quality-qa/SKILL.md`
- **Mục đích**: Kiểm thử chất lượng dữ liệu DB, reconciliation ETL/ELT, kiểm tra lệch schema (Schema drift) qua Read-only DB MCP.
- **Inputs**: DB Read-only connection, ETL pipeline specs.
- **Outputs**: `data-drift.json`, bằng chứng đối soát dữ liệu.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `qa-run` (kiểm tra persistence DB sau khi UI action thành công).
  - 📤 **Chuyển dữ liệu tới**: `qa-run Aggregation` & `plane-qa`.

---

### 🔟 `ai-quality-qa` (LLM, Chatbot & RAG Evaluator)
- **Đường dẫn**: `ai-quality-qa/SKILL.md`
- **Mục đích**: Khảo sát và đánh giá chất lượng mô hình AI, Chatbot, RAG pipeline dựa trên Golden Dataset.
- **Inputs**: Golden Dataset, RAG prompt contexts, model responses.
- **Outputs**: Báo cáo Eval Dataset metrics (Accuracy, Hallucination rate, Faithfulness).
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `doc-to-md` (nạp dataset).
  - 📤 **Chuyển dữ liệu tới**: `qa-run Aggregation` & `plane-qa`.

---

### 11. `accessibility-qa` (WCAG & Accessibility Auditor)
- **Đường dẫn**: `accessibility-qa/SKILL.md`
- **Mục đích**: Kiểm thử khả năng truy cập Web Accessibility theo chuẩn WCAG 2.2 bằng axe-core, bàn phím và Screen Reader.
- **Inputs**: Web page URL, OmniParser Bounding Boxes map.
- **Outputs**: `a11y-report.json`, danh sách vi phạm accessibility.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `qa-run` & `qa-vendor/OmniParser`.
  - 📤 **Chuyển dữ liệu tới**: `qa-run Aggregation` & `plane-qa`.

---

### 12. `performance-qa` (Load, Stress & Bottleneck Auditor)
- **Đường dẫn**: `performance-qa/SKILL.md`
- **Mục đích**: Một public orchestrator chọn internal JMeter/k6 engine, chạy smoke/load, normalize kết quả, Chrome DevTools trace và phát hiện bottleneck.
- **Inputs**: Common run config (engine, workload model, RPS/Virtual Users, thresholds, authorization, abort conditions).
- **Outputs**: `.jmx` hoặc k6 script, `result.json`, `summary.md`, `summary.html`, native engine report và Chrome trace metrics.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `api-contract-qa` & `qa-run`; JMeter/k6 là engine nội bộ, không phải skill công khai.
  - 📤 **Chuyển dữ liệu tới**: `qa-run Aggregation` & `plane-qa` (log bug nếu vi phạm SLA).

---

### 13. `api-contract-qa` (API Spec & Webhook Contract Validator)
- **Đường dẫn**: `api-contract-qa/SKILL.md`
- **Mục đích**: Kiểm tra sự tuân thủ hợp đồng API (OpenAPI, Swagger, Postman, GraphQL, gRPC) so với code thực tế.
- **Inputs**: File OpenAPI spec, Postman collection, endpoint definitions từ `Understand-Anything`.
- **Outputs**: `contract-report.json`, danh sách API sai khác (Contract Mismatches).
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `qa-run: REPO_BUSINESS_DISCOVERY` & `qa-vendor/Understand-Anything`.
  - 📤 **Chuyển dữ liệu tới**: `performance-qa`, `pentest-run` & `qa-run Aggregation`.

---

### 14. `mobile-qa` (Android / iOS Mobile App Tester)
- **Đường dẫn**: `mobile-qa/SKILL.md`
- **Mục đích**: Kiểm thử ứng dụng di động Android/iOS trên Emulator/Real Device sử dụng Appium framework.
- **Inputs**: File APK / IPA, Mobile device matrix.
- **Outputs**: `mobile-report.json`, video recording & appium execution logs.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `testcase-template` (kịch bản test mobile).
  - 📤 **Chuyển dữ liệu tới**: `qa-run Aggregation` & `plane-qa`.

---

### 15. `github-mcp-qa` (GitHub API & CI/CD Pipeline Auditor)
- **Đường dẫn**: `github-mcp-qa/SKILL.md`
- **Mục đích**: Quản lý repository, Git diff, Pull Requests, Issues và Actions CI/CD pipelines qua GitHub API MCP.
- **Inputs**: GitHub PR URL, commit hash, test results từ `qa-run`.
- **Outputs**: Comments trên PR, CI check status (PASS/FAIL), danh sách changed files.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: `qa-run Aggregation` & `plane-qa`.
  - 📤 **Chuyển dữ liệu tới**: `qa-run: REPO_BUSINESS_DISCOVERY` (kích hoạt quét incremental theo changed files).

---

### 16. `postman` (Postman MCP Bootstrap & Operations)
- **Đường dẫn**: `postman/SKILL.md`
- **Mục đích**: Tự cấu hình Postman MCP, điều phối OAuth và quản lý workspace, collection, environment, specification, mock hoặc monitor.
- **Inputs**: Active agent host và Postman account được người dùng chọn trong OAuth.
- **Outputs**: MCP connection đã verify cùng Postman resource ID và workspace context.
- **Mối liên hệ / Mapping**:
  - 📥 **Nhận dữ liệu từ**: User request hoặc API artifact cần resolve trong Postman.
  - 📤 **Chuyển dữ liệu tới**: `api-contract-qa`, `testcase-template` hoặc collection runner.
