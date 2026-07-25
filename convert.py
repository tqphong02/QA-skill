import re

with open("qa-run/SKILL.md", "r", encoding="utf-8") as f:
    content = f.read()

translations = [
    (r"dùng khi user yêu cầu test/khám phá tổng thể web app, bootstrap project chưa có `qa-knowledge/knowledge-index\.json`, hoặc user yêu cầu refresh index/guide\.",
     r"use when the user requests overall testing/exploration of a web app, bootstrap project lacking `qa-knowledge/knowledge-index.json`, or explicitly requests index/guide refresh."),
    (r"\*\*Ưu tiên chạy `scripts/extract-flow\.mjs` trước\*\* để trích xuất business flow từ DOM \+ network \+ JS runtime trong 1 lần quét duy nhất mà không cần đọc source code FE/BE\.",
     r"**Prioritize running `scripts/extract-flow.mjs` first** to extract business flows from DOM + network + JS runtime in a single sweep without reading FE/BE source code."),
    (r"Script tự login, duyệt toàn navigation, intercept API calls, map state machine từ status labels, ghi `qa-knowledge/app-flow-map\.json` \(AI load nhanh\) và các shard đầu ra của `qa-knowledge/knowledge-index\.json`\.",
     r"Script auto-logins, browses all navigation, intercepts API calls, maps state machines from status labels, writes `qa-knowledge/app-flow-map.json` (fast AI load) and output shards of `qa-knowledge/knowledge-index.json`."),
    (r"`app-business-guide\.md` chỉ giữ vai trò summary tương thích; knowledge chính nằm ở index và các shard được nó trỏ tới\.",
     r"`app-business-guide.md` only serves as a compatibility summary; the main knowledge lies in the index and the shards it points to."),
    (r"\*\*Sau khi có index, mọi run tiếp theo chỉ đọc index \+ shard đúng scope — 0 browser action cho phase \"hiểu context\"\*\*; chỉ mở browser khi cần verify thực tế\.",
     r"**Once the index exists, every subsequent run only reads the index + scope-specific shard — 0 browser actions for the \"understanding context\" phase**; only open the browser when actual verification is needed."),
    (r"Lập module map trước rồi đi qua flow business chính có thể truy cập, role/state/input/side-effect/integration/UI/UX và coverage gap",
     r"Map modules first, then traverse accessible main business flows, role/state/input/side-effect/integration/UI/UX and coverage gaps"),
    (r"dùng khi user đưa URL hoặc Spreadsheet ID của Google Sheet chứa bộ testcase\.",
     r"use when user provides a Google Sheet URL or Spreadsheet ID containing the testcase suite."),
    (r"\*\*Đọc business flow trước khi test\*\*: Luôn nạp `qa-knowledge/app-flow-map\.json` \(hoặc `app-business-guide\.md`\) để AI hiểu toàn bộ logic business, route, role và state transition của app trước khi tương tác\.",
     r"**Read business flows before testing**: Always load `qa-knowledge/app-flow-map.json` (or `app-business-guide.md`) so AI understands the entire app business logic, route, role and state transition before interacting."),
    (r"\*\*Thực thi song song UI/UX & Functional\*\*: Khi user yêu cầu \"chạy execution testcase toàn bộ\", tự động kích hoạt `--parallel --workers 4`\. Các worker phân chia kiểm thử đồng thời cả phần \*\*UI/UX\*\* \(layout, overflow, truncation qua `visual-audit\.mjs`\) và phần \*\*Functional\*\* \(business logic, mutation, validation qua `attack-surface\.mjs`\)\.",
     r"**Execute UI/UX & Functional in parallel**: When the user requests to run the entire testcase execution, automatically activate `--parallel --workers 4`. Workers divide the testing simultaneously for both **UI/UX** (layout, overflow, truncation via `visual-audit.mjs`) and **Functional** (business logic, mutation, validation via `attack-surface.mjs`)."),
    (r"Chạy `node scripts/execute-sheet\.mjs --sheet-url <URL> --parallel --workers 4` để đọc, phân chia worker và thực thi\.",
     r"Run `node scripts/execute-sheet.mjs --sheet-url <URL> --parallel --workers 4` to read, divide workers and execute."),
    (r"Sau khi test xong, tự động cập nhật ngược lại Google Sheet với Result \(`Pass`/`Fail`/`N/A`/`Untest`\), Priority \(`Critical`/`High`/`Medium`/`Low`\), và Note \(ngữ cảnh thủ công dễ hiểu, KHÔNG ghi stacktrace hay error code khô khan\)\.",
     r"After testing, auto-update back to Google Sheet with Result (`Pass`/`Fail`/`N/A`/`Untest`), Priority (`Critical`/`High`/`Medium`/`Low`), and Note (manual-friendly context, DO NOT write dry stacktraces or error codes)."),
    (r"không quét lại toàn app\. Đọc `knowledge-index\.json` để lấy shard liên quan, rồi đọc app/feature guide tương thích nếu có, sau đó chạy RETEST_PLUS cho ticket và impacted area\. Nếu thiếu index/guide, chỉ discovery đủ để hiểu feature hiện tại rồi tạo index \+ shard",
     r"do not rescan the full app. Read `knowledge-index.json` to get relevant shards, then read compatible app/feature guides if available, then run RETEST_PLUS for the ticket and impacted areas. If index/guide is missing, only discover enough to understand the current feature then create the index + shard"),
    (r"reuse guide hiện có và mở rộng knowledge đúng phần scope đã kiểm tra",
     r"reuse existing guides and expand knowledge exactly in the inspected scope"),
    (r"Không gọi baseline là exhaustive nếu chưa đi qua đủ module, role, state hoặc data\. Ghi `covered`, `partial`, `blocked` hoặc `not_covered` trong `coverage_map`",
     r"Do not call baseline exhaustive if you have not traversed enough modules, roles, states or data. Log `covered`, `partial`, `blocked` or `not_covered` in `coverage_map`"),
    (r"Hiểu ngữ cảnh trước \(Nguyên tắc #1\)", r"Understand context first (Principle #1)"),
    (r"\"Thông minh\" = \*\*không click mù\*\*\. AI phải đọc & hiểu logic trước, rồi mới poke\. Thứ tự BẮT BUỘC:",
     r"\"Smart\" = **no blind clicking**. AI must read & understand logic first, then poke. MANDATORY order:"),
    (r"Bước 0 — Đọc business guide đã lưu", r"Step 0 — Read saved business guides"),
    (r"Đọc `qa-knowledge/knowledge-index\.json` trước nếu có, rồi chỉ load đúng shard/guide mà index trỏ tới",
     r"Read `qa-knowledge/knowledge-index.json` first if present, then only load the exact shards/guides the index points to"),
    (r"Reuse flow, role/data, route/API, state transition và reusable assets còn đúng",
     r"Reuse still-valid flows, roles/data, routes/APIs, state transitions and reusable assets"),
    (r"Không đọc guide của feature khác và không bỏ verification chỉ vì guide cũ ghi PASS",
     r"Do not read other features' guides and do not skip verification just because the old guide says PASS"),
    (r"Bước A — Đọc requirement / spec / AC \(NẾU có\)", r"Step A — Read requirement / spec / AC (IF present)"),
    (r"Trích thành danh sách requirements có ID", r"Extract into a list of requirements with IDs"),
    (r"Nếu KHÔNG có document → \*\*hỏi user\*\* cung cấp, hoặc đồng ý test theo UI hiện có",
     r"If NO document is provided -> **ask the user** to provide one, or agree to test based on the existing UI"),
    (r"Chi tiết fetch từ Plane", r"Details for fetching from Plane"),
    (r"Bước B — Trích xuất \"bản đồ logic\" trước khi test", r"Step B — Extract the \"logic map\" before testing"),
    (r"bước 1 → 2 → 3 → … → kết quả", r"step 1 -> 2 -> 3 -> … -> result"),
    (r"ai được làm gì\?", r"who can do what?"),
    (r"Inputs & ràng buộc", r"Inputs & constraints"),
    (r"loại data nào hợp lệ, range, format", r"what data is valid, ranges, formats"),
    (r"thao tác này ghi đâu\?", r"where does this operation write?"),
    (r"Edge case đáng ngờ", r"Suspicious edge cases"),
    (r"Integration bên thứ 3", r"3rd party integration"),
    (r"Bước C — Form charter \(mục tiêu exploratory có chủ đích\)", r"Step C — Form a charter (purposeful exploratory goal)"),
    (r"Một dòng: \"Khám phá <feature> tìm lỗi về <rủi ro>; account <role>; ~<thời gian>\.\"",
     r"One liner: \"Explore <feature> for <risk> bugs; account <role>; ~<time>.\""),
    (r"Charter tốt nêu rõ \*\*risk\*\* \(không phải \"test cho vui\"\)",
     r"A good charter clearly states the **risk** (not just \"testing for fun\")"),
    (r"Bước D — Lái UI có định hướng \(qua MCP Playwright\)", r"Step D — Goal-oriented UI driving (via MCP Playwright)"),
    (r"Happy path → snapshot từng bước → verify state đổi đúng",
     r"Happy path -> snapshot every step -> verify state changes correctly"),
    (r"\*\*Sai lệch có chủ đích\*\* ở mỗi bước: thử input invalid / boundary / concurrency",
     r"**Purposeful deviations** at each step: try invalid / boundary / concurrent inputs"),
    (r"Note lỗi console/HTTP lộ ra", r"Note exposed console/HTTP errors"),
    (r"## The trap this skill exists to prevent", r"## The trap this skill exists to prevent"),
    (r"\*\*Test everything every cycle\*\* — running full regression on every change, exhausting time budget, missing real regressions in noise\. Skill enforces risk-based, scoped cycles: phân tầng Sanity → Smoke → Regression, chỉ chạy mức cần thiết cho context\.", 
     r"**Test everything every cycle** — running full regression on every change, exhausting time budget, missing real regressions in noise. Skill enforces risk-based, scoped cycles: tiering Sanity -> Smoke -> Regression, only running what's necessary for the context.")
]

for pat, repl in translations:
    content = re.sub(pat, repl, content, flags=re.MULTILINE)

with open("qa-run/SKILL_TEMP2.md", "w", encoding="utf-8") as f:
    f.write(content)

print("Created qa-run/SKILL_TEMP2.md with more translations")
