#!/usr/bin/env node

/**
 * Build a canonical JSON index and a self-contained Effective HTML companion
 * for every in-scope skill in this repository.
 * Visual conventions are adapted from plannotator/effective-html revision
 * 63b1bf04d3e48b426a31fdb82b1319c33663fde4 (MIT).
 *
 * No external packages are required.
 *
 * Usage:
 *   node scripts/build-skill-catalog.mjs
 *   node scripts/build-skill-catalog.mjs --root . --json skill-catalog/qa-skill-catalog.json --html skill-catalog/QA-skill.html
 *   node scripts/build-skill-catalog.mjs --bundle skill-catalog/QA-skill-effective-html-04-08-2026
 *   node scripts/build-skill-catalog.mjs --check skill-catalog/QA-skill.html
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadSkillRegistry } from './skill-registry.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, '..');
const now = new Date();
const defaultDateLabel = [
  String(now.getDate()).padStart(2, '0'),
  String(now.getMonth() + 1).padStart(2, '0'),
  now.getFullYear(),
].join('-');

const GROUPS = [
  {
    id: 'design',
    label: 'Design & knowledge',
    note: 'Turn source material into testable knowledge',
    labelVi: 'Thiết kế & tri thức',
    noteVi: 'Chuyển nguồn đầu vào thành tri thức có thể kiểm thử',
    color: 'clay',
    skills: ['support-document-conversion', 'static-requirements-analysis', 'support-testcase-authoring', 'dynamic-web-automation', 'hybrid-ui-ux-review'],
  },
  {
    id: 'core',
    label: 'Core execution',
    note: 'Discover, execute and reason from implementation',
    labelVi: 'Thực thi cốt lõi',
    noteVi: 'Khám phá, thực thi và phân tích từ implementation',
    color: 'olive',
    skills: ['dynamic-web-exploratory', 'hybrid-source-coverage', 'hybrid-api-contract', 'governance-release-quality'],
  },
  {
    id: 'assurance',
    label: 'Specialized assurance',
    note: 'Deep quality and security disciplines',
    labelVi: 'Đảm bảo chuyên sâu',
    noteVi: 'Các chuyên môn chất lượng và bảo mật chuyên sâu',
    color: 'blue',
    skills: [
      'hybrid-accessibility',
      'dynamic-ai-evaluation',
      'dynamic-data-quality',
      'dynamic-mobile',
      'dynamic-performance',
      'dynamic-security-pentest',
      'pentest-security',
      'static-supply-chain-security',
      'dynamic-resilience',
      'dynamic-compatibility',
    ],
  },
  {
    id: 'integration',
    label: 'Connected systems',
    note: 'Read and write external QA systems safely',
    labelVi: 'Hệ thống kết nối',
    noteVi: 'Đọc và ghi an toàn trên các hệ thống QA bên ngoài',
    color: 'gold',
    skills: ['integration-plane', 'integration-google-drive', 'integration-github', 'integration-postman', 'adapter-browser-session'],
  },
  {
    id: 'auxiliary',
    label: 'Internal & auxiliary',
    note: 'Engines, providers and retired compatibility surfaces',
    labelVi: 'Nội bộ & phụ trợ',
    noteVi: 'Engine, provider và lớp tương thích đã ngừng dùng',
    color: 'violet',
    skills: ['engine-jmeter', 'engine-k6', 'provider-graphify', 'provider-effective-html', 'retired-jmeter-qa'],
  },
];

const SKILL_INVENTORY_POLICY = {
  included: 'Root public skills plus authored and non-vendor bundled nested skills inside the repository',
  excluded: [
    { pattern: 'vendor/**/SKILL.md', reason: 'dynamic-web-exploratory scope contract excludes vendored development dependencies' },
  ],
};

const RELATIONSHIPS = [
  {
    from: 'support-document-conversion', to: 'integration-google-drive', flow: 'requirements', kind: 'route',
    label: 'remote Drive source', labelVi: 'nguồn Drive từ xa',
    sourceRefs: [{ path: 'support/document-conversion/SKILL.md', line: 20, quote: 'route the request to `integration-google-drive`' }],
  },
  {
    from: 'support-document-conversion', to: 'static-requirements-analysis', flow: 'requirements', kind: 'handoff',
    label: 'converted Markdown', labelVi: 'Markdown đã chuyển đổi',
    sourceRefs: [{ path: 'static-testing/requirements-analysis/SKILL.md', line: 23, quote: 'run `support/document-conversion/scripts/convert.sh` first' }],
  },
  {
    from: 'static-requirements-analysis', to: 'support-testcase-authoring', flow: 'requirements', kind: 'handoff',
    label: 'confirmed analysis', labelVi: 'phân tích đã xác nhận',
    sourceRefs: [{ path: 'static-testing/requirements-analysis/SKILL.md', line: 33, quote: 'Hand the confirmed Markdown and Q&A answers to `support-testcase-authoring`' }],
  },
  {
    from: 'integration-plane', to: 'dynamic-web-exploratory', flow: 'retest', kind: 'route',
    label: 'ticket read', labelVi: 'đọc ticket',
    sourceRefs: [{ path: 'integration/plane/SKILL.md', line: 3, quote: 'integration-plane read → dynamic-web-exploratory RETEST_PLUS' }],
  },
  {
    from: 'dynamic-web-exploratory', to: 'integration-plane', flow: 'retest', kind: 'return',
    label: 'comment and state', labelVi: 'comment và trạng thái',
    sourceRefs: [{ path: 'integration/plane/SKILL.md', line: 3, quote: 'dynamic-web-exploratory RETEST_PLUS → integration-plane comment/state' }],
  },
  {
    from: 'integration-google-drive', to: 'dynamic-web-automation', flow: 'sheet', kind: 'composition',
    label: 'Sheet execution', labelVi: 'thực thi testcase Sheet',
    sourceRefs: [{ path: 'integration/google-drive/SKILL.md', line: 34, quote: 'use `dynamic-web-automation` BUILD_AND_RUN' }],
  },
  {
    from: 'dynamic-web-exploratory', to: 'dynamic-web-automation', flow: 'browser', kind: 'exit',
    label: 'automation request', labelVi: 'yêu cầu viết automation',
    sourceRefs: [{ path: 'dynamic-testing/web-exploratory/SKILL.md', line: 75, quote: 'Route to `dynamic-web-automation` BUILD_AND_RUN; it owns' }],
  },
  {
    from: 'dynamic-web-automation', to: 'dynamic-web-exploratory', flow: 'browser', kind: 'route',
    label: 'exploratory/retest', labelVi: 'exploratory hoặc retest',
    sourceRefs: [{ path: 'dynamic-testing/web-automation/SKILL.md', line: 3, quote: 'Use dynamic-web-exploratory only for exploratory/ad-hoc browser QA' }],
  },
  {
    from: 'dynamic-web-exploratory', to: 'dynamic-mobile', flow: 'browser', kind: 'route',
    label: 'native mobile traffic', labelVi: 'traffic mobile native',
    sourceRefs: [{ path: 'dynamic-testing/web-exploratory/SKILL.md', line: 52, quote: 'Route native Android/iOS traffic to `dynamic-mobile`' }],
  },
  {
    from: 'hybrid-accessibility', to: 'dynamic-web-exploratory', flow: 'browser', kind: 'reuse',
    label: 'browser state route', labelVi: 'tái dùng trạng thái browser',
    sourceRefs: [{ path: 'hybrid-testing/accessibility/SKILL.md', line: 24, quote: 'existing `dynamic-web-exploratory` browser route' }],
  },
  {
    from: 'hybrid-api-contract', to: 'integration-postman', flow: 'api', kind: 'route',
    label: 'Postman operations', labelVi: 'vận hành Postman',
    sourceRefs: [{ path: 'hybrid-testing/api-contract/SKILL.md', line: 22, quote: 'Route Postman MCP installation, authentication, diagnosis, and workspace operations to `integration-postman`' }],
  },
  {
    from: 'integration-postman', to: 'hybrid-api-contract', flow: 'api', kind: 'route',
    label: 'live contract validation', labelVi: 'xác minh contract live',
    sourceRefs: [{ path: 'integration/postman/SKILL.md', line: 92, quote: 'Route contract validation against a live implementation to `hybrid-api-contract`' }],
  },
  {
    from: 'hybrid-api-contract', to: 'support-testcase-authoring', flow: 'api', kind: 'handoff',
    label: 'API testcase document', labelVi: 'tài liệu testcase API',
    sourceRefs: [{ path: 'hybrid-testing/api-contract/SKILL.md', line: 30, quote: 'Use `support-testcase-authoring` when the user asks to produce testcase Markdown or Excel' }],
  },
  {
    from: 'integration-postman', to: 'support-testcase-authoring', flow: 'api', kind: 'route',
    label: 'testcase document', labelVi: 'tạo tài liệu testcase',
    sourceRefs: [{ path: 'integration/postman/SKILL.md', line: 92, quote: 'Route explicit testcase document creation to `support-testcase-authoring`' }],
  },
  {
    from: 'hybrid-api-contract', to: 'dynamic-performance', flow: 'performance', kind: 'route',
    label: 'performance behavior', labelVi: 'hành vi hiệu năng',
    sourceRefs: [{ path: 'hybrid-testing/api-contract/SKILL.md', line: 31, quote: 'Route performance behavior, JMeter and k6 work to the single public `dynamic-performance`' }],
  },
  {
    from: 'hybrid-api-contract', to: 'dynamic-security-pentest', flow: 'api', kind: 'route',
    label: 'exploit-focused auth', labelVi: 'kiểm tra auth kiểu exploit',
    sourceRefs: [{ path: 'hybrid-testing/api-contract/SKILL.md', line: 32, quote: 'Route exploit-focused authorization testing to `dynamic-security-pentest`' }],
  },
  {
    from: 'hybrid-source-coverage', to: 'support-testcase-authoring', flow: 'source', kind: 'handoff',
    label: 'source-derived testcase', labelVi: 'testcase từ source',
    sourceRefs: [{ path: 'hybrid-testing/source-coverage/references/testcase-handoff.md', line: 7, quote: '`support-testcase-authoring` owns' }],
  },
  {
    from: 'dynamic-performance', to: 'engine-jmeter', flow: 'performance', kind: 'internal-engine',
    label: 'exact .jmx', labelVi: 'engine cho .jmx',
    sourceRefs: [{ path: 'dynamic-testing/performance/SKILL.md', line: 18, quote: 'Exact `.jmx` → JMeter' }],
  },
  {
    from: 'dynamic-performance', to: 'engine-k6', flow: 'performance', kind: 'internal-engine',
    label: 'k6 script', labelVi: 'engine cho script k6',
    sourceRefs: [{ path: 'dynamic-testing/performance/SKILL.md', line: 19, quote: 'Exact k6 `.js`, `.ts`, or `.mjs` → k6' }],
  },
  {
    from: 'retired-jmeter-qa', to: 'dynamic-performance', flow: 'performance', kind: 'retired-into',
    label: 'retired into', labelVi: 'đã hợp nhất vào',
    sourceRefs: [
      { path: 'scripts/setup_lib.sh', line: 229, quote: 'RETIRED_SKILLS=("jmeter-qa")' },
      { path: 'dynamic-testing/performance/SKILL.md', line: 8, quote: 'Use one public skill and two internal engines' },
    ],
  },
  {
    from: 'dynamic-web-exploratory', to: 'provider-graphify', flow: 'providers', kind: 'optional-provider',
    label: 'static discovery', labelVi: 'provider khám phá tĩnh',
    sourceRefs: [{ path: 'dynamic-testing/web-exploratory/references/GRAPHIFY-EFFECTIVE-HTML.md', line: 16, quote: 'Graphify is an optional static discovery provider' }],
  },
  {
    from: 'dynamic-web-exploratory', to: 'provider-effective-html', flow: 'providers', kind: 'presentation-provider',
    label: 'interactive companion', labelVi: 'trình bày HTML tương tác',
    sourceRefs: [{ path: 'dynamic-testing/web-exploratory/references/GRAPHIFY-EFFECTIVE-HTML.md', line: 72, quote: 'HTML renderer is an optional companion view' }],
  },
  {
    from: 'hybrid-ui-ux-review', to: 'dynamic-web-exploratory', flow: 'browser', kind: 'route',
    label: 'live browser evidence', labelVi: 'evidence browser live',
    sourceRefs: [{ path: 'hybrid-testing/ui-ux-review/SKILL.md', line: 8, quote: 'live navigation and network/console observation are handed to `dynamic-web-exploratory`' }],
  },
  {
    from: 'hybrid-ui-ux-review', to: 'hybrid-accessibility', flow: 'browser', kind: 'handoff',
    label: 'accessibility handoff', labelVi: 'bàn giao accessibility',
    sourceRefs: [{ path: 'hybrid-testing/ui-ux-review/SKILL.md', line: 8, quote: 'WCAG conformance is handed to `hybrid-accessibility`' }],
  },
  {
    from: 'dynamic-web-exploratory', to: 'governance-release-quality', flow: 'source', kind: 'handoff',
    label: 'release evidence', labelVi: 'evidence release',
    sourceRefs: [{ path: 'governance/release-quality/SKILL.md', line: 8, quote: 'It consumes evidence from `dynamic-web-exploratory` and specialized skills' }],
  },
  {
    from: 'static-supply-chain-security', to: 'dynamic-security-pentest', flow: 'api', kind: 'route',
    label: 'exploit validation', labelVi: 'validation exploit',
    sourceRefs: [{ path: 'static-testing/supply-chain-security/SKILL.md', line: 16, quote: 'Route confirmed exploit validation to `dynamic-security-pentest`' }],
  },
  {
    from: 'dynamic-resilience', to: 'governance-release-quality', flow: 'performance', kind: 'handoff',
    label: 'recovery risk', labelVi: 'rủi ro recovery',
    sourceRefs: [{ path: 'dynamic-testing/resilience/SKILL.md', line: 18, quote: 'Hand measured recovery and unresolved resilience risk to `governance-release-quality`' }],
  },
  {
    from: 'dynamic-compatibility', to: 'dynamic-web-exploratory', flow: 'browser', kind: 'route',
    label: 'web matrix execution', labelVi: 'thực thi matrix web',
    sourceRefs: [{ path: 'dynamic-testing/compatibility/SKILL.md', line: 8, quote: 'live browser/device actions belong to `dynamic-web-exploratory` or `dynamic-mobile`' }],
  },
  {
    from: 'dynamic-compatibility', to: 'dynamic-mobile', flow: 'browser', kind: 'route',
    label: 'native matrix execution', labelVi: 'thực thi matrix native',
    sourceRefs: [{ path: 'dynamic-testing/compatibility/SKILL.md', line: 8, quote: 'live browser/device actions belong to `dynamic-web-exploratory` or `dynamic-mobile`' }],
  },
];

const FLOWS = [
  {
    id: 'requirements',
    label: 'Requirements to testcase',
    summary: 'Resolve the source, recover business logic, then create synchronized testcase artifacts',
    steps: ['integration-google-drive or support-document-conversion', 'static-requirements-analysis', 'support-testcase-authoring'],
    labelVi: 'Yêu cầu → testcase',
    summaryVi: 'Xác định nguồn, khôi phục logic nghiệp vụ rồi tạo các artifact testcase đồng bộ',
    stepsVi: ['integration-google-drive hoặc support-document-conversion', 'static-requirements-analysis', 'support-testcase-authoring'],
  },
  {
    id: 'retest',
    label: 'Plane retest',
    summary: 'Read the exact ticket, run RETEST_PLUS, then post verified evidence and state',
    steps: ['integration-plane read + doctor', 'dynamic-web-exploratory RETEST_PLUS', 'integration-plane result + read-back'],
    labelVi: 'Retest Plane',
    summaryVi: 'Đọc đúng ticket, chạy RETEST_PLUS rồi đăng bằng chứng và trạng thái đã xác minh',
    stepsVi: ['integration-plane đọc ticket + doctor', 'dynamic-web-exploratory chạy RETEST_PLUS', 'integration-plane đăng kết quả + đọc lại'],
  },
  {
    id: 'sheet',
    label: 'Sheet execution',
    summary: 'Drive owns Sheet CRUD while unified POM owns build, browser execution, evidence and verdict',
    steps: ['integration-google-drive resolves and reads the Sheet', 'dynamic-web-automation BUILD_AND_RUN', 'integration-google-drive writes verified results'],
    labelVi: 'Thực thi Google Sheet',
    summaryVi: 'Drive phụ trách CRUD trên Sheet còn unified POM phụ trách build, chạy browser, evidence và verdict',
    stepsVi: ['integration-google-drive xác định và đọc Sheet', 'dynamic-web-automation BUILD_AND_RUN', 'integration-google-drive ghi kết quả đã xác minh'],
  },
  {
    id: 'api',
    label: 'API contract',
    summary: 'Operate Postman when needed, verify the observable contract, then hand documents to the testcase skill',
    steps: ['integration-postman', 'hybrid-api-contract', 'support-testcase-authoring'],
    labelVi: 'Hợp đồng API',
    summaryVi: 'Vận hành Postman khi cần, xác minh contract quan sát được rồi bàn giao tài liệu testcase',
    stepsVi: ['integration-postman', 'hybrid-api-contract', 'support-testcase-authoring'],
  },
  {
    id: 'source',
    label: 'Source-derived QA',
    summary: 'Resolve repository context, analyze deterministic code paths, and execute risk-driven QA',
    steps: ['hybrid-source-coverage analyzes deterministic paths', 'support-testcase-authoring owns the requested document'],
    labelVi: 'QA từ source code',
    summaryVi: 'Xác định repository, phân tích đường đi code xác định và thực thi QA theo rủi ro',
    stepsVi: ['hybrid-source-coverage phân tích path xác định', 'support-testcase-authoring sở hữu tài liệu được yêu cầu'],
  },
  {
    id: 'exploratory-browser',
    label: 'Exploratory and ad-hoc browser execution',
    summary: 'dynamic-web-exploratory actively operates the live browser for scoped discovery, exploratory, ad-hoc and UI/UX testing while observing network, console and page errors in the same session',
    steps: ['Prepare TEST_INTELLIGENCE', 'Act on the live browser', 'Run Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX', 'Correlate same-session Network + Console + Page Error', 'Save evidence and update QA knowledge'],
    labelVi: 'Khám phá & Ad-hoc browser',
    summaryVi: 'dynamic-web-exploratory tự thao tác trên browser đang chạy để khám phá theo phạm vi, exploratory, ad-hoc và UI/UX; đồng thời quan sát network, console và page error trong cùng session',
    stepsVi: ['Chuẩn bị TEST_INTELLIGENCE', 'Tự thao tác trên browser live', 'Chạy Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX', 'Đối chiếu Network + Console + Page Error cùng session', 'Lưu evidence và cập nhật QA knowledge'],
    nodes: ['dynamic-web-exploratory'],
    sourceRefs: [
      { path: 'dynamic-testing/web-exploratory/SKILL.md', line: 20, quote: 'DISCOVERY_CORE =' },
      { path: 'dynamic-testing/web-exploratory/SKILL.md', line: 45, quote: 'Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX' },
      { path: 'dynamic-testing/web-exploratory/SKILL.md', line: 52, quote: 'Applied to every live browser stack without changing DISCOVERY_CORE' },
    ],
  },
  {
    id: 'browser-observability',
    label: 'Browser MCP network and console observability',
    summary: 'Use the observer attached to the exact page that performs UI actions to inspect network requests, console messages and page errors',
    steps: ['Resolve the same-session observer before opening the page', 'Playwright MCP reads network/console when it drives the UI', 'Chrome DevTools MCP reads network/console only when it drives or attaches to that exact page', 'Inspect XHR/fetch/document/WebSocket and console/page errors after critical actions', 'Correlate the signal with the triggering UI step'],
    labelVi: 'Browser MCP: Network & Console',
    summaryVi: 'Dùng MCP/observer gắn với đúng page đang thao tác UI để đọc network request, console message và page error',
    stepsVi: ['Chọn observer cùng session trước khi mở page', 'Playwright MCP đọc network/console khi chính nó điều khiển UI', 'Chrome DevTools MCP chỉ đọc khi điều khiển hoặc attach đúng page đó', 'Kiểm tra XHR/fetch/document/WebSocket cùng console/page error sau action quan trọng', 'Đối chiếu tín hiệu với bước UI đã kích hoạt'],
    nodes: ['dynamic-web-exploratory'],
    sourceRefs: [
      { path: 'dynamic-testing/web-exploratory/references/BROWSER-OBSERVABILITY.md', line: 3, quote: 'same page/session used for UI actions' },
      { path: 'dynamic-testing/web-exploratory/references/BROWSER-OBSERVABILITY.md', line: 28, quote: 'Use `chrome-devtools-mcp` when Chrome DevTools is explicitly selected' },
      { path: 'dynamic-testing/web-exploratory/references/BROWSER-OBSERVABILITY.md', line: 61, quote: 'list_network_requests' },
    ],
  },
  {
    id: 'browser',
    label: 'Browser and mobile routing',
    summary: 'Keep exploratory execution in dynamic-web-exploratory, automation authoring in Playwright POM, accessibility in its audit, and native traffic in mobile QA',
    steps: ['dynamic-web-exploratory for browser execution', 'dynamic-web-automation for authored suites', 'dynamic-mobile for native traffic', 'hybrid-accessibility may reuse dynamic-web-exploratory states'],
    labelVi: 'Định tuyến browser và mobile',
    summaryVi: 'Giữ exploratory execution ở dynamic-web-exploratory, viết automation ở Playwright POM, accessibility ở audit riêng và traffic native ở mobile QA',
    stepsVi: ['dynamic-web-exploratory thực thi browser', 'dynamic-web-automation viết suite', 'dynamic-mobile xử lý traffic native', 'hybrid-accessibility có thể tái dùng trạng thái dynamic-web-exploratory'],
  },
  {
    id: 'mobile-network',
    label: 'Mobile Appium and network inspection',
    summary: 'Appium MCP performs the Android/iOS journey while an authorized proxy engine captures and correlates mobile traffic',
    steps: ['Resolve device matrix and capture authorization', 'Appium MCP creates the exact device session and performs the journey', 'Select Proxyman, mitmproxy, Fiddler, Charles or HTTP Toolkit with the network doctor', 'Capture passively and correlate traffic with each UI action', 'Sanitize HAR/evidence and restore proxy, CA, VPN and device state'],
    labelVi: 'Mobile: Appium & Network',
    summaryVi: 'Appium MCP thực thi hành trình Android/iOS; một proxy engine được ủy quyền bắt traffic và đối chiếu với từng bước UI',
    stepsVi: ['Xác định device matrix và phạm vi capture được phép', 'Appium MCP tạo đúng device session và thực thi hành trình', 'Chọn Proxyman, mitmproxy, Fiddler, Charles hoặc HTTP Toolkit qua network doctor', 'Capture thụ động và đối chiếu traffic với từng action UI', 'Làm sạch HAR/evidence rồi khôi phục proxy, CA, VPN và trạng thái thiết bị'],
    nodes: ['dynamic-mobile'],
    sourceRefs: [
      { path: 'dynamic-testing/mobile/SKILL.md', line: 27, quote: 'Use Appium MCP for interactive discovery' },
      { path: 'dynamic-testing/mobile/SKILL.md', line: 36, quote: 'Use Proxyman MCP for interactive macOS traffic inspection' },
      { path: 'dynamic-testing/mobile/SKILL.md', line: 85, quote: 'Inspect mobile network behavior' },
    ],
  },
  {
    id: 'performance',
    label: 'Performance routing',
    summary: 'One public performance skill selects JMeter or k6 internally; the old jmeter-qa surface is retired',
    steps: ['hybrid-api-contract routes performance work', 'dynamic-performance owns the workflow', 'JMeter or k6 runs as an internal engine'],
    labelVi: 'Định tuyến performance',
    summaryVi: 'Một skill performance công khai chọn JMeter hoặc k6 ở nội bộ; bề mặt jmeter-qa cũ đã ngừng dùng',
    stepsVi: ['hybrid-api-contract chuyển phần hiệu năng', 'dynamic-performance sở hữu workflow', 'JMeter hoặc k6 chạy như engine nội bộ'],
  },
  {
    id: 'providers',
    label: 'Optional providers',
    summary: 'dynamic-web-exploratory may use Graphify for static discovery and effective HTML for presentation without exposing either as a public QA skill',
    steps: ['dynamic-web-exploratory owns repository discovery', 'Graphify optionally supplies static candidates', 'effective HTML renders validated data'],
    labelVi: 'Provider tùy chọn',
    summaryVi: 'dynamic-web-exploratory có thể dùng Graphify để khám phá tĩnh và effective HTML để trình bày mà không biến chúng thành skill QA công khai',
    stepsVi: ['dynamic-web-exploratory sở hữu repository discovery', 'Graphify cung cấp candidate tĩnh tùy chọn', 'effective HTML render dữ liệu đã xác thực'],
  },
];

const OPERATIONAL_BRANCHES = {
  'dynamic-web-exploratory': [
    {
      id: 'DISCOVERY_CORE',
      titleVi: 'Khám phá & Ad-hoc trên browser',
      summaryVi: 'Tự thao tác trên browser live để khám phá flow, hành vi, lỗi và trải nghiệm theo phạm vi đã xác định',
      childrenVi: ['Scoped Business Discovery', 'Exploratory', 'Ad-hoc', 'UI/UX'],
    },
    {
      id: 'BROWSER_OBSERVABILITY',
      titleVi: 'Browser MCP đọc Network, Console và Page Error',
      summaryVi: 'Dùng Playwright MCP, Chrome DevTools MCP hoặc runtime observer trong đúng session đang thao tác UI; không ghép evidence từ browser khác',
      childrenVi: ['Playwright MCP: browser_network_requests + browser_console_messages', 'Chrome DevTools MCP: list/get_network_request + list/get_console_message', 'Playwright runtime observer', 'XHR/fetch/document/WebSocket', 'Page Error correlation', 'Same-session hard gate'],
    },
    {
      id: 'TEST_INTELLIGENCE',
      titleVi: 'Chuẩn bị test intelligence',
      summaryVi: 'Hợp nhất nguồn trước khi chọn rủi ro và hành động kiểm thử',
      childrenVi: ['Requirement', 'Runtime Knowledge', 'Current Source', 'UI Observation', 'Business Brief', 'Ranked Risks', 'Exploratory Charters'],
    },
    {
      id: 'RETEST_PLUS',
      titleVi: 'Retest ticket đầy đủ',
      summaryVi: 'Xác minh lỗi gốc và vùng ảnh hưởng thay vì chỉ lặp lại một bước',
      childrenVi: ['Original Retest', 'Sanity', 'Impacted Regression', 'DISCOVERY_CORE'],
    },
    {
      id: 'SANITY_REGRESSION_PLUS',
      titleVi: 'Sanity và regression theo rủi ro',
      summaryVi: 'Kiểm tra nhanh vùng chính và regression bị tác động',
      childrenVi: ['Sanity', 'Impacted Regression', 'DISCOVERY_CORE'],
    },
    {
      id: 'APP_BASELINE_DISCOVERY',
      titleVi: 'Khám phá baseline app hoặc feature',
      summaryVi: 'Khởi tạo hiểu biết ban đầu cho app hoặc feature chưa có knowledge đủ',
      childrenVi: ['DISCOVERY_CORE ở phạm vi app/feature', 'Coverage map', 'Business guide'],
    },
    {
      id: 'REPO_BUSINESS_DISCOVERY',
      titleVi: 'Khám phá business logic từ repository',
      summaryVi: 'Phân tích source để lập bản đồ rule, flow, contract và permission; thêm browser discovery khi có runtime',
      childrenVi: ['Source discovery', 'Rule và flow extraction', 'Contract và permission mapping', 'DISCOVERY_CORE khi có live runtime'],
    },
    {
      id: 'UI_BUSINESS_RECONCILIATION',
      titleVi: 'Đối chiếu UI với source, tài liệu và runtime',
      summaryVi: 'Tìm mâu thuẫn giữa những gì UI thể hiện và logic có thẩm quyền',
      childrenVi: ['UI observation', 'Source comparison', 'Document comparison', 'Runtime comparison', 'DISCOVERY_CORE'],
    },
  ],
  'dynamic-mobile': [
    {
      id: 'DEVICE_MATRIX',
      titleVi: 'Chọn thiết bị và lifecycle',
      summaryVi: 'Xác định platform, OS, device class, app lifecycle và network state trước khi thực thi',
      childrenVi: ['Android/iOS', 'Emulator/Simulator', 'Real device', 'Clean install/upgrade', 'Network state'],
    },
    {
      id: 'APPIUM_MCP_EXECUTION',
      titleVi: 'Appium MCP tự thao tác mobile',
      summaryVi: 'Tạo hoặc attach đúng session rồi khám phá hierarchy, thao tác gesture, nhập liệu và xác minh hành trình',
      childrenVi: ['select_device', 'appium_session_management', 'appium_find_element', 'appium_gesture', 'appium_set_value', 'Screenshot/recording evidence'],
    },
    {
      id: 'ANDROID_IOS_PREPARATION',
      titleVi: 'Chuẩn bị Android và iOS',
      summaryVi: 'Giải quyết capability, build, signing, driver và device target trước khi test',
      childrenVi: ['UiAutomator2', 'XCUITest', 'APK/IPA/app', 'Simulator preparation', 'Real-device provisioning'],
    },
    {
      id: 'MOBILE_EXPLORATORY',
      titleVi: 'Khám phá và kiểm thử hành vi mobile',
      summaryVi: 'Thực thi happy path và các nhánh validation, permission, lifecycle, interruption và gesture',
      childrenVi: ['Exploratory', 'Smoke', 'Regression', 'Permission', 'Deep link/notification', 'Rotation/keyboard/gesture'],
    },
    {
      id: 'MOBILE_NETWORK_INSPECTION',
      titleVi: 'Đọc traffic mobile và đối chiếu UI',
      summaryVi: 'Appium thực thi hành trình còn proxy engine bắt HTTP/HTTPS, WebSocket hoặc GraphQL theo phạm vi được ủy quyền',
      childrenVi: ['Proxyman MCP/CLI', 'mitmproxy/mitmdump', 'Fiddler Everywhere MCP', 'Charles headless/CLI', 'HTTP Toolkit', 'Sanitized HAR', 'UI-step correlation'],
    },
    {
      id: 'NETWORK_BEHAVIOR',
      titleVi: 'Kiểm tra hành vi mạng',
      summaryVi: 'Xác minh request, response, retry, timeout, latency, offline/recovery và WebSocket reconnect',
      childrenVi: ['HTTP status/body contract', 'Failure và retry', 'Latency/throttling', 'Offline/recovery', 'WebSocket reconnect'],
    },
    {
      id: 'MOBILE_EVIDENCE',
      titleVi: 'Thu thập evidence mobile',
      summaryVi: 'Lưu screenshot, recording, device logs và network summary đã làm sạch',
      childrenVi: ['Screenshot', 'Screen recording', 'logcat/iOS logs', 'Crash/ANR report', 'Sanitized network summary'],
    },
    {
      id: 'CLEANUP_RECOVERY',
      titleVi: 'Dọn dẹp và khôi phục',
      summaryVi: 'Dừng capture, xóa session thuộc run và khôi phục mọi thay đổi tạm trên host/device',
      childrenVi: ['Stop proxy capture', 'Restore proxy/CA/VPN', 'Restore permission/orientation/locale', 'Delete owned Appium session'],
    },
  ],
  'hybrid-ui-ux-review': [
    {
      id: 'DESIGN_REQUIREMENT_TRACE',
      titleVi: 'Trace design và requirement',
      summaryVi: 'Giữ design source, requirement, implementation và runtime observation thành các provenance riêng',
      childrenVi: ['Requirement IDs', 'Design reference/token', 'Implementation observation', 'Runtime observation'],
    },
    {
      id: 'VISUAL_STATE_REVIEW',
      titleVi: 'Review visual và interaction states',
      summaryVi: 'Kiểm tra hierarchy, spacing, typography, responsive và các state có thể nhìn thấy',
      childrenVi: ['Default', 'Loading', 'Validation', 'Error', 'Empty', 'Success', 'Desktop/Mobile'],
    },
    {
      id: 'UIUX_EVIDENCE',
      titleVi: 'Evidence UI/UX',
      summaryVi: 'Chỉ kết luận visual PASS khi có screenshot/video và ghi rõ limitation của review tĩnh',
      childrenVi: ['Screenshot/video', 'State ID', 'Viewport', 'Accessibility handoff', 'Same-session browser run'],
    },
  ],
  'governance-release-quality': [
    {
      id: 'RELEASE_PACKET',
      titleVi: 'Đọc release packet',
      summaryVi: 'Resolve release ID, build, scope, risk, test summary, defects, evidence và approvals',
      childrenVi: ['Release/build', 'Impacted scope', 'Risk', 'Test runs', 'Defects', 'Evidence', 'Approvals'],
    },
    {
      id: 'EXIT_CRITERIA',
      titleVi: 'Đánh giá exit criteria',
      summaryVi: 'Kiểm tra gate theo mức rủi ro và phân biệt PASS, FAIL với BLOCKED',
      childrenVi: ['Functional', 'Security', 'Regression', 'Non-functional', 'Operational readiness', 'Exception'],
    },
    {
      id: 'GO_NO_GO',
      titleVi: 'Go/No-Go decision',
      summaryVi: 'Tạo quyết định có thể audit mà không tự deploy hay đổi tracker state',
      childrenVi: ['PASS', 'FAIL', 'BLOCKED', 'Gate ledger', 'Owner handoff'],
    },
  ],
  'static-supply-chain-security': [
    {
      id: 'REDACTED_SECRET_SCAN',
      titleVi: 'Quét secret đã redact',
      summaryVi: 'Tìm candidate trong boundary local mà không in giá trị credential hoặc đọc keychain',
      childrenVi: ['Exact repo boundary', 'Excluded directories', 'Secret kind', 'Relative path/line', 'Redaction'],
    },
    {
      id: 'DEPENDENCY_SBOM',
      titleVi: 'Dependency và SBOM readiness',
      summaryVi: 'Inventory manifest/lockfile và đánh giá mức sẵn sàng cho SCA/SBOM bên ngoài',
      childrenVi: ['Manifest', 'Lockfile', 'SBOM config', 'License policy', 'CVE limitation'],
    },
    {
      id: 'APPSEC_HANDOFF',
      titleVi: 'Handoff security finding',
      summaryVi: 'Giữ scanner alert là Candidate rồi chuyển exploit validation và release risk qua owner phù hợp',
      childrenVi: ['Candidate', 'Reproduction', 'Control comparison', 'dynamic-security-pentest', 'Release gate'],
    },
  ],
  'dynamic-resilience': [
    {
      id: 'RESILIENCE_HYPOTHESIS',
      titleVi: 'Hypothesis và steady state',
      summaryVi: 'Khai báo failure mode, SLO baseline, blast radius và kỳ vọng graceful degradation',
      childrenVi: ['Dependency', 'SLO/SLI', 'Blast radius', 'Expected behavior'],
    },
    {
      id: 'BOUNDED_INJECTION',
      titleVi: 'Bounded fault injection',
      summaryVi: 'Gắn stop condition, owner approval, rollback và cleanup trước active execution',
      childrenVi: ['Target', 'Approval', 'Abort threshold', 'Injection', 'Cleanup'],
    },
    {
      id: 'RECOVERY_MEASUREMENT',
      titleVi: 'Đo recovery và RTO/RPO',
      summaryVi: 'Thu metrics/logs/traces, đo thời gian hồi phục và kiểm data integrity sau restore',
      childrenVi: ['RTO', 'RPO', 'Recovery evidence', 'Data integrity', 'Follow-up'],
    },
  ],
  'dynamic-compatibility': [
    {
      id: 'COMPATIBILITY_DIMENSIONS',
      titleVi: 'Chọn dimensions tương thích',
      summaryVi: 'Xác định browser, device, OS, locale, timezone, currency và RTL policy theo requirement',
      childrenVi: ['Chromium/Firefox/WebKit', 'Desktop/Mobile', 'OS/device', 'Locale', 'Timezone/Currency', 'RTL'],
    },
    {
      id: 'LOCALIZATION_CASES',
      titleVi: 'Expected localized behavior',
      summaryVi: 'Kiểm text expansion, Unicode, translated validation, date/number format và fallback',
      childrenVi: ['Long text', 'Unicode', 'Validation', 'Empty state', 'Date/number', 'Fallback'],
    },
    {
      id: 'MATRIX_EXECUTION',
      titleVi: 'Coverage và evidence',
      summaryVi: 'Mỗi dimension phải có executable case trước khi route sang browser hoặc mobile execution',
      childrenVi: ['Case coverage', 'dynamic-web-exploratory', 'dynamic-mobile', 'Screenshot/video', 'Release risk'],
    },
  ],
  'dynamic-web-automation': [
    {
      id: 'TESTCASE_POM_EXECUTION',
      titleVi: 'Unified testcase execution và POM',
      summaryVi: 'Một workflow build POM, chạy browser, thu evidence và trả verdict cho đúng Testcase ID',
      childrenVi: ['Manifest plan', 'Selectors + Page Objects + Specs', 'Traceability gate', 'Playwright execution', 'Visual + same-session trace', 'PASS/FAILED/N/A/UNTEST', 'Optional Sheet projection'],
    },
  ],
};

const AUXILIARY = [
  {
    name: 'engine-jmeter', title: 'JMeter engine', group: 'auxiliary', kind: 'internal-engine', status: 'internal',
    sourcePath: 'dynamic-testing/performance/SKILL.md', vi: {
      summary: 'Engine nội bộ cho file .jmx, được dynamic-performance điều phối',
      advantages: ['Phù hợp workload JMeter hiện có', 'Tích hợp với report và threshold chung'],
      limitations: ['Không phải skill công khai độc lập', 'Cần JMeter runtime khả dụng'],
    },
    branches: ['Nhận và kiểm tra file .jmx', 'JMeter smoke gate', 'Thực thi workload', 'Chuẩn hóa JTL', 'Đánh giá threshold và report'],
  },
  {
    name: 'engine-k6', title: 'k6 engine', group: 'auxiliary', kind: 'internal-engine', status: 'internal',
    sourcePath: 'dynamic-testing/performance/SKILL.md', vi: {
      summary: 'Engine nội bộ cho k6 script, dùng chung workload contract của dynamic-performance',
      advantages: ['Script nhẹ và phù hợp CI', 'Dùng chung result schema với JMeter'],
      limitations: ['Không phải skill công khai độc lập', 'Cần k6 runtime khả dụng'],
    },
    branches: ['Nhận và kiểm tra k6 script', 'k6 smoke gate', 'Thực thi workload', 'Chuẩn hóa k6 result', 'Đánh giá threshold và report'],
  },
  {
    name: 'provider-graphify', title: 'Graphify', group: 'auxiliary', kind: 'optional-provider', status: 'optional',
    sourcePath: 'dynamic-testing/web-exploratory/references/GRAPHIFY-EFFECTIVE-HTML.md', vi: {
      summary: 'Provider khám phá dependency tĩnh tùy chọn; không phải business oracle hay runtime observer',
      advantages: ['Lập chỉ mục dependency toàn repository', 'Hỗ trợ chọn vùng impact và call-flow candidate'],
      limitations: ['Quan hệ chỉ là static candidate', 'Không chứng minh business rule hoặc runtime behavior'],
    },
    branches: ['Runtime doctor', 'Static repository discovery', 'Normalized nodes và candidates', 'Bounded context slice', 'Impact và call-flow candidates'],
  },
  {
    name: 'provider-effective-html', title: 'effective-html', group: 'auxiliary', kind: 'presentation-provider', status: 'optional',
    sourcePath: 'dynamic-testing/web-exploratory/references/GRAPHIFY-EFFECTIVE-HTML.md', vi: {
      summary: 'Provider trình bày HTML tương tác từ dữ liệu đã được xác thực',
      advantages: ['Artifact tự chứa và dễ chia sẻ', 'Hỗ trợ dark mode, pan, zoom và tương tác'],
      limitations: ['Chỉ là lớp trình bày', 'Dữ liệu nguồn vẫn là chuẩn có thẩm quyền'],
    },
    branches: ['Validated input', 'Self-contained HTML render', 'Dark mode', 'Pan và zoom', 'Interactive node và flow'],
  },
  {
    name: 'retired-jmeter-qa', title: 'jmeter-qa', group: 'auxiliary', kind: 'retired-surface', status: 'retired',
    sourcePath: 'scripts/setup_lib.sh', vi: {
      summary: 'Thư mục tương thích cũ đã ngừng dùng và được hợp nhất vào dynamic-performance',
      advantages: ['Giữ dấu vết tương thích cho cấu hình cũ'],
      limitations: ['Không còn SKILL.md hoặc workflow độc lập', 'Không nên chọn trực tiếp'],
    },
    branches: ['Compatibility marker', 'Retired skill detection', 'Route sang dynamic-performance'],
  },
].map((item) => ({
  ...item,
  description: item.vi.summary,
  principle: item.vi.summary,
  headings: item.branches.map((title) => ({ level: 2, title })),
  interface: {},
  resources: { scripts: 0, references: 0, assets: 0 },
  metrics: { lines: 0, words: item.vi.summary.split(/\s+/).length },
}));

const VI_SKILL_TEXT = {
  'hybrid-accessibility': 'Đánh giá khả năng truy cập web theo WCAG 2.2 bằng kiểm tra tự động kết hợp thao tác bàn phím, focus, zoom, contrast và screen reader',
  'dynamic-ai-evaluation': 'Đánh giá chất lượng LLM, chatbot, RAG và agent theo golden dataset, tính đúng đắn, groundedness, safety, độ ổn định, latency và chi phí',
  'hybrid-api-contract': 'Xác minh REST, OpenAPI, Postman, GraphQL, gRPC và webhook contract so với implementation quan sát được',
  'static-requirements-analysis': 'Phân tích tài liệu nghiệp vụ như senior QA/QC, dựng business flow và tạo XMind cùng bộ Q&A đồng bộ',
  'dynamic-data-quality': 'Kiểm tra database, ETL/ELT, reconciliation, lineage, freshness, schema drift và chất lượng dữ liệu theo ranh giới read-only',
  'support-document-conversion': 'Chuyển PDF, DOCX, PPTX, XLSX và các artifact local sang Markdown có cấu trúc để skill khác sử dụng',
  'integration-github': 'Đọc và vận hành repository, PR, Issue và GitHub Actions qua GitHub MCP với ranh giới xác thực rõ ràng',
  'adapter-browser-session': 'Trình duyệt Chromium tách biệt cho AI agents kế thừa trạng thái đăng nhập thực tế',
  'integration-google-drive': 'Đọc và thực hiện CRUD trên Drive, Docs, Sheets, Slides, permissions, report và evidence qua Google Drive MCP',
  'dynamic-mobile': 'Lập kế hoạch, thực thi và chẩn đoán QA Android/iOS bằng Appium, emulator, real device và network capture được ủy quyền',
  'dynamic-security-pentest': 'Điều phối pentest được ủy quyền từ engagement contract, reconnaissance đến validation, evidence và reporting',
  'dynamic-performance': 'Điều phối performance test an toàn bằng JMeter hoặc k6 với workload chung, smoke gate, threshold và báo cáo bottleneck',
  'integration-plane': 'Đọc và quản lý ticket Plane, bug, comment, evidence và trạng thái QA trên nhiều workspace',
  'dynamic-web-automation': 'Build và chạy testcase Playwright POM với browser evidence, verdict, Sheet projection và CI',
  'integration-postman': 'Cấu hình và vận hành Postman MCP, Postman CLI và Newman cho collection, environment, spec, mock và monitor',
  'dynamic-web-exploratory': 'Thực thi browser QA theo rủi ro từ business logic, source, requirement và runtime evidence với quan sát network/console cùng session',
  'support-testcase-authoring': 'Tạo, chỉnh sửa và review testcase Markdown/Excel đồng bộ từ một nguồn JSON đã xác thực',
  'hybrid-source-coverage': 'Phân tích source code xác định cho function, branch, path, call graph, NestJS DI, test generation và runtime coverage',
  'hybrid-ui-ux-review': 'Đối chiếu design-to-code, visual hierarchy, responsive states, UX interaction và screenshot/video evidence',
  'governance-release-quality': 'Đánh giá release theo risk, test summary, defect, evidence, approval và exit criteria',
  'static-supply-chain-security': 'Quét local redacted cho secret, dependency manifest, lockfile, SBOM readiness và secure CI controls',
  'dynamic-resilience': 'Validate bounded fault-injection, recovery, observability, rollback và RTO/RPO plan',
  'dynamic-compatibility': 'Validate browser/device/locale/timezone/currency/i18n và RTL coverage matrix',
};

const VI_SKILL_INSIGHTS = {
  'hybrid-accessibility': {
    advantages: ['Kết hợp axe/WCAG với kiểm tra bàn phím và screen reader', 'Bao phủ focus, contrast, zoom, reflow và semantic'],
    limitations: ['Không thể kết luận screen reader PASS nếu chưa chạy thiết bị thật', 'Một số lỗi trải nghiệm vẫn cần đánh giá thủ công'],
  },
  'dynamic-ai-evaluation': {
    advantages: ['Đánh giá được correctness, groundedness, safety, latency và cost', 'Hỗ trợ golden dataset và regression có thể lặp lại'],
    limitations: ['Chất lượng kết quả phụ thuộc mạnh vào golden dataset', 'Không thay thế đánh giá domain của con người'],
  },
  'hybrid-api-contract': {
    advantages: ['Đối chiếu schema, status, header, auth và negative behavior', 'Hỗ trợ nhiều loại contract như REST, GraphQL, gRPC và webhook'],
    limitations: ['Cần specification hoặc contract đủ rõ', 'Không tự thay thế performance test hay pentest chuyên sâu'],
  },
  'static-requirements-analysis': {
    advantages: ['Khôi phục business flow và phát hiện ambiguity có hệ thống', 'Tạo XMind và Q&A đồng bộ từ một nguồn dữ liệu'],
    limitations: ['Cần tài liệu hoặc nguồn nghiệp vụ đáng tin cậy', 'Không sinh testcase khi câu hỏi nghiệp vụ quan trọng chưa được giải đáp'],
  },
  'dynamic-data-quality': {
    advantages: ['Bao phủ reconciliation, lineage, freshness và schema drift', 'Giữ ranh giới truy vấn read-only rõ ràng'],
    limitations: ['Cần quyền database read-only đã được chứng minh', 'Không sửa dữ liệu hoặc pipeline thay người vận hành'],
  },
  'support-document-conversion': {
    advantages: ['Chuyển nhiều định dạng sang Markdown có cấu trúc', 'Xử lý local để giảm rủi ro lộ dữ liệu'],
    limitations: ['Chỉ dùng cho file local hoặc upload đã materialize', 'OCR và bảng phức tạp có thể cần kiểm tra lại'],
  },
  'integration-github': {
    advantages: ['Đọc repository, PR, Issue và Actions qua API chính thức', 'Tách GitHub MCP auth khỏi Git SSH'],
    limitations: ['Phụ thuộc OAuth/PAT và quyền repository', 'Mutation cần xác định đúng account, repo và branch'],
  },
  'adapter-browser-session': {
    advantages: ['Cách ly không gian làm việc', 'Không cần thiết lập lại quá trình xác thực'],
    limitations: ['Không hỗ trợ Windows/Linux', 'Không chặn được body/headers mạng đầy đủ'],
  },
  'integration-google-drive': {
    advantages: ['CRUD native cho Drive, Docs, Sheets và Slides', 'Có exact-target check và read-back sau mutation'],
    limitations: ['Phụ thuộc MCP/OAuth và permission của đối tượng', 'Không dùng web search thay cho nội dung Drive riêng tư'],
  },
  'dynamic-mobile': {
    advantages: ['Bao phủ Android/iOS, emulator, real device và network capture', 'Kết hợp Appium với tooling native'],
    limitations: ['Cần device matrix và môi trường chạy phù hợp', 'Network interception phải có phạm vi được ủy quyền'],
  },
  'dynamic-security-pentest': {
    advantages: ['Có engagement contract, doctor, evidence và control comparison', 'Điều phối nhiều lớp kiểm tra bảo mật có kiểm soát'],
    limitations: ['Chỉ chạy khi có ủy quyền và phạm vi rõ ràng', 'Scanner alert chưa phải finding nếu chưa tái hiện'],
  },
  'dynamic-performance': {
    advantages: ['Một workflow chung cho JMeter và k6', 'Có smoke gate, threshold và chuẩn hóa report'],
    limitations: ['Load test cần stop condition và phê duyệt phạm vi', 'Kết quả phụ thuộc workload model và môi trường ổn định'],
  },
  'integration-plane': {
    advantages: ['Đọc/ghi ticket, comment, evidence và state theo workflow QA', 'Tự áp dụng state mapping PASS/FAILED/BLOCKED'],
    limitations: ['Phụ thuộc API key và quyền workspace', 'Write phải xác định đúng ticket rồi read-back'],
  },
  'dynamic-web-automation': {
    advantages: ['Một workflow từ manifest đến POM, browser evidence và verdict', 'Tách selector qua Page Object và hỗ trợ Sheet/CI/Allure'],
    limitations: ['Không dùng cho exploratory hoặc retest ad-hoc', 'Cần target, selector evidence và test data đủ để thực thi'],
  },
  'integration-postman': {
    advantages: ['Quản lý workspace, collection, environment, spec, mock và monitor', 'Hỗ trợ Postman CLI và Newman fallback có điều kiện'],
    limitations: ['Phụ thuộc account, OAuth và runtime Postman', 'Contract validation live được chuyển sang hybrid-api-contract'],
  },
  'dynamic-web-exploratory': {
    advantages: ['Thực thi QA theo rủi ro từ requirement, source và runtime', 'Quan sát network, console và page error trong cùng session'],
    limitations: ['Cần Business Execution Brief đủ trạng thái READY', 'Không dùng để viết automation hoặc testcase document'],
  },
  'support-testcase-authoring': {
    advantages: ['Tạo Markdown trước Excel từ một JSON nguồn', 'Giữ ID và nội dung đồng bộ theo schema cố định'],
    limitations: ['Cần expected behavior và requirement mapping rõ', 'Không phù hợp cho ghi chú exploratory hoặc bug report'],
  },
  'hybrid-source-coverage': {
    advantages: ['Phân tích branch, path, call graph và NestJS DI xác định', 'Phân biệt static candidate với measured coverage'],
    limitations: ['Static analysis không chứng minh runtime coverage', 'Testcase document phải bàn giao qua support-testcase-authoring'],
  },
  'hybrid-ui-ux-review': {
    advantages: ['Gắn visual review với requirement, viewport, state và evidence', 'Tách rõ design mismatch, implementation mismatch và accessibility handoff'],
    limitations: ['Không thay thế human visual review hoặc live browser observation', 'Không tự kết luận WCAG nếu chưa qua hybrid-accessibility'],
  },
  'governance-release-quality': {
    advantages: ['Tạo go/no-go decision có gate ledger và provenance', 'Phân biệt defect risk, thiếu proof và approved exception'],
    limitations: ['Không thay thế test chuyên môn hoặc CI verification', 'Không tự deploy, đổi ticket state hoặc chấp thuận exception'],
  },
  'static-supply-chain-security': {
    advantages: ['Local redacted scan an toàn cho manifest và candidate secret', 'Làm rõ giới hạn giữa preflight, SAST/SCA và pentest'],
    limitations: ['Không query CVE/registry hoặc chứng minh exploitability', 'Regex sạch không đồng nghĩa repo sạch hoàn toàn'],
  },
  'dynamic-resilience': {
    advantages: ['Buộc plan có SLO, stop, rollback, cleanup, observability và RTO/RPO', 'Ngăn active fault injection thiếu approval'],
    limitations: ['Plan READY chưa phải measured recovery', 'Cần staging/device/service owner thật cho execution'],
  },
  'dynamic-compatibility': {
    advantages: ['Kiểm coverage dimensions và executable case trước live run', 'Bao phủ locale, timezone, currency, Unicode và RTL rõ ràng'],
    limitations: ['Matrix không thay thế browser/device execution', 'Expected translation và supported-platform policy cần owner xác nhận'],
  },
};

function parseArgs(argv) {
  const args = {
    root: defaultRoot,
    json: 'skill-catalog/qa-skill-catalog.json',
    html: 'skill-catalog/QA-skill.html',
    bundle: `skill-catalog/QA-skill-effective-html-${defaultDateLabel}`,
    check: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--root') args.root = path.resolve(argv[++index]);
    else if (value === '--json') { args.json = argv[++index]; args.bundle = ''; }
    else if (value === '--html') { args.html = argv[++index]; args.bundle = ''; }
    else if (value === '--bundle') args.bundle = argv[++index];
    else if (value === '--check') args.check = argv[++index];
    else if (value === '--help' || value === '-h') {
      console.log('node scripts/build-skill-catalog.mjs [--root <dir>] [--json <file>] [--html <file>] [--bundle <dir>] [--check <html>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function parseFrontmatter(markdown, sourcePath) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`Missing YAML frontmatter: ${sourcePath}`);
  const values = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  if (!values.name || !values.description) {
    throw new Error(`Frontmatter requires name and description: ${sourcePath}`);
  }
  return { frontmatter: values, body: markdown.slice(match[0].length) };
}

function countFiles(directory) {
  if (!fs.existsSync(directory)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) count += countFiles(target);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

function parseInterface(skillDirectory) {
  const file = path.join(skillDirectory, 'agents', 'openai.yaml');
  if (!fs.existsSync(file)) return {};
  const text = readText(file);
  const pick = (key) => {
    const match = text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
    if (!match) return '';
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  };
  return {
    displayName: pick('display_name'),
    shortDescription: pick('short_description'),
    defaultPrompt: pick('default_prompt'),
  };
}

function plainText(value) {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstPrinciple(body) {
  const lines = body.split('\n');
  const explicit = lines.find((line) => /core principle|nguyên tắc cốt lõi/i.test(line));
  if (explicit) return plainText(explicit.replace(/^[-\s]+/, ''));
  const paragraph = body
    .replace(/^#\s+.+$/m, '')
    .split(/\n\s*\n/)
    .map((item) => plainText(item))
    .find((item) => item && !item.startsWith('|'));
  return paragraph || '';
}

function extractHeadings(body) {
  return body
    .split('\n')
    .map((line) => line.match(/^(#{2,4})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ level: match[1].length, title: plainText(match[2]) }));
}

function scanSkillFiles(root) {
  const included = [];
  const excluded = [];

  function recordKnownVendorSkills(skillsDirectory) {
    if (!fs.existsSync(skillsDirectory)) return;
    for (const entry of fs.readdirSync(skillsDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDirectory, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        excluded.push({
          path: path.relative(root, skillFile).split(path.sep).join('/'),
          reason: SKILL_INVENTORY_POLICY.excluded[0].reason,
        });
      }
    }
  }

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'vendor') continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(target);
        continue;
      }
      if (!entry.isFile() || entry.name !== 'SKILL.md') continue;
      const relativePath = path.relative(root, target).split(path.sep).join('/');
      const segments = relativePath.split('/');
      if (segments.includes('vendor')) {
        excluded.push({ path: relativePath, reason: SKILL_INVENTORY_POLICY.excluded[0].reason });
      } else {
        included.push({ file: target, relativePath });
      }
    }
  }

  visit(root);
  recordKnownVendorSkills(path.join(root, 'vendor', 'chrome-devtools-mcp', 'skills'));
  recordKnownVendorSkills(path.join(root, 'dynamic-testing', 'web-exploratory', 'vendor', 'Understand-Anything', 'understand-anything-plugin', 'skills'));
  included.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  excluded.sort((left, right) => left.path.localeCompare(right.path));
  return { included, excluded };
}

function findParentSkill(relativePath, directoryToSkill) {
  let directory = path.posix.dirname(path.posix.dirname(relativePath));
  while (directory && directory !== '.') {
    const parent = directoryToSkill.get(directory);
    if (parent) return parent;
    directory = path.posix.dirname(directory);
  }
  return null;
}

function sectionSummary(body, heading) {
  const lines = body.split('\n');
  const headingIndex = lines.findIndex((line) => {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    return match && match[1].length === heading.level && plainText(match[2]) === heading.title;
  });
  if (headingIndex < 0) return `Chi tiết theo mục ${heading.title}`;
  const paragraphs = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const nextHeading = line.match(/^(#{2,4})\s+(.+)$/);
    if (nextHeading && nextHeading[1].length <= heading.level) break;
    const cleaned = plainText(line.replace(/^[-*]\s+/, ''));
    if (!cleaned || cleaned.startsWith('|') || cleaned.startsWith('```')) continue;
    paragraphs.push(cleaned);
    if (paragraphs.join(' ').length >= 220) break;
  }
  return paragraphs.join(' ').slice(0, 260) || `Chi tiết theo mục ${heading.title}`;
}

function sectionChildren(body, heading) {
  const lines = body.split('\n');
  const headingIndex = lines.findIndex((line) => {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    return match && match[1].length === heading.level && plainText(match[2]) === heading.title;
  });
  if (headingIndex < 0) return [];
  const children = [];
  const prose = [];
  let tableHeaders = null;
  let inFence = false;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const nextHeading = line.match(/^(#{2,4})\s+(.+)$/);
    if (nextHeading && nextHeading[1].length <= heading.level) break;
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    const match = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/);
    if (match) {
      const child = plainText(match[1]);
      if (child && !children.includes(child)) children.push(child);
      if (children.length >= 20) break;
      continue;
    }
    if (inFence) continue;
    if (line.trim().startsWith('|')) {
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => plainText(cell.trim()))
        .filter(Boolean);
      if (!cells.length || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      if (!tableHeaders) {
        tableHeaders = cells;
        continue;
      }
      const row = cells
        .map((cell, cellIndex) => `${tableHeaders[cellIndex] || `Column ${cellIndex + 1}`}: ${cell}`)
        .join(' · ')
        .trim();
      if (row && !children.includes(row)) children.push(row);
      if (children.length >= 20) break;
      continue;
    }
    const paragraph = plainText(line.trim());
    if (paragraph && paragraph.length >= 12 && !prose.includes(paragraph)) {
      prose.push(paragraph.slice(0, 280));
    }
    if (prose.length >= 12) break;
  }
  return children.length ? children : prose;
}

function deriveOperationalBranches(name, body, headings) {
  const configured = OPERATIONAL_BRANCHES[name];
  if (configured?.length) return configured;
  return headings
    .filter((heading) => heading.level === 2)
    .map((heading, index) => {
      const children = [];
      let active = false;
      for (const candidate of headings) {
        if (candidate === heading) {
          active = true;
          continue;
        }
        if (!active) continue;
        if (candidate.level <= heading.level) break;
        if (candidate.level > heading.level) children.push(candidate.title);
      }
      return {
        id: `${name.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_${String(index + 1).padStart(2, '0')}`,
        titleVi: heading.title,
        summaryVi: sectionSummary(body, heading),
        childrenVi: children.length ? children : sectionChildren(body, heading).slice(0, 20),
        derived: true,
      };
    })
    .map((branch) => ({
      ...branch,
      childrenVi: branch.childrenVi.length ? branch.childrenVi : ['Chi tiết theo SKILL.md'],
    }));
}

function collectSkills(root) {
  const inventory = scanSkillFiles(root);
  const registry = loadSkillRegistry(root);
  const publicEntries = new Map(registry.skills.map((entry) => [entry.id, entry]));
  const parsed = inventory.included.map(({ file, relativePath }) => {
    const markdown = readText(file);
    const { frontmatter, body } = parseFrontmatter(markdown, relativePath);
    const folder = path.basename(path.dirname(file));
    const registryEntry = publicEntries.get(frontmatter.name);
    if (registryEntry && relativePath !== `${registryEntry.path}/SKILL.md`) {
      throw new Error(`Skill registry/path mismatch: ${frontmatter.name} != ${relativePath}`);
    }
    if (!registryEntry && folder !== frontmatter.name) {
      throw new Error(`Nested skill folder/name mismatch: ${folder} != ${frontmatter.name}`);
    }
    return { file, relativePath, markdown, body, frontmatter, folder };
  });
  const directoryToSkill = new Map(
    parsed.map((item) => [path.posix.dirname(item.relativePath), item]),
  );

  const skills = parsed.map(({ file, relativePath, markdown, body, frontmatter, folder }) => {
    const registryEntry = publicEntries.get(frontmatter.name);
    const parent = findParentSkill(relativePath, directoryToSkill);
    const group = GROUPS.find((candidate) => candidate.skills.includes(frontmatter.name))
      || (parent && GROUPS.find((candidate) => candidate.id === parent.group))
      || GROUPS.find((candidate) => candidate.id === 'assurance');
    if (!group) throw new Error(`Skill is not assigned to a catalog group: ${frontmatter.name}`);
    const headings = extractHeadings(body);
    const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || frontmatter.name;
    return {
      name: frontmatter.name,
      title,
      folder,
      group: group.id,
      scope: relativePath.includes('/_bundled_plugin/') ? 'bundled' : registryEntry ? 'public-root' : parent ? 'nested' : 'public-root',
      parent: parent?.frontmatter?.name || null,
      description: frontmatter.description,
      principle: firstPrinciple(body),
      vi: {
        summary: VI_SKILL_TEXT[frontmatter.name] || frontmatter.description,
        advantages: VI_SKILL_INSIGHTS[frontmatter.name]?.advantages || [
          'Có hard gate, boundary và output có thể kiểm tra từ SKILL.md',
        ],
        limitations: VI_SKILL_INSIGHTS[frontmatter.name]?.limitations || [
          'Kết luận cuối cùng vẫn phụ thuộc target, input và evidence của run thực tế',
        ],
      },
      operationalBranches: deriveOperationalBranches(frontmatter.name, body, headings),
      headings,
      interface: parseInterface(path.dirname(file)),
      resources: {
        scripts: countFiles(path.join(path.dirname(file), 'scripts')),
        references: countFiles(path.join(path.dirname(file), 'references')),
        assets: countFiles(path.join(path.dirname(file), 'assets')),
      },
      metrics: {
        lines: markdown.split('\n').length,
        words: plainText(markdown).split(/\s+/).filter(Boolean).length,
      },
      sourcePath: relativePath,
      source: markdown,
      sourceHash: crypto.createHash('sha256').update(markdown).digest('hex'),
    };
  });

  return { skills, excludedSkillFiles: inventory.excluded };
}

function validateSourceRef(root, relation, sourceRef) {
  const sourceFile = path.resolve(root, sourceRef.path);
  if (!fs.existsSync(sourceFile)) throw new Error(`Missing relationship evidence: ${sourceRef.path}`);
  const actual = readText(sourceFile).split('\n')[sourceRef.line - 1];
  if (actual === undefined || !actual.includes(sourceRef.quote)) {
    throw new Error(
      `Stale relationship evidence for ${relation.from} -> ${relation.to}: `
      + `${sourceRef.path}:${sourceRef.line} does not contain ${JSON.stringify(sourceRef.quote)}`,
    );
  }
}

function resolveEvidenceLines(items, root) {
  return items.map((item) => ({
    ...item,
    sourceRefs: (item.sourceRefs || []).map((sourceRef) => {
      const sourceFile = path.resolve(root, sourceRef.path);
      if (!fs.existsSync(sourceFile)) return { ...sourceRef };
      const lines = readText(sourceFile).split('\n');
      const matches = lines.flatMap((line, index) => line.includes(sourceRef.quote) ? [index + 1] : []);
      if (matches.length === 1) return { ...sourceRef, line: matches[0] };
      return { ...sourceRef };
    }),
  }));
}

function validateCatalog(catalog, root = defaultRoot) {
  if (catalog.schemaVersion !== 1) throw new Error('Unsupported schemaVersion');
  if (!Array.isArray(catalog.skills) || catalog.skills.length === 0) throw new Error('Catalog has no skills');
  const names = new Set();
  for (const skill of catalog.skills) {
    if (names.has(skill.name)) throw new Error(`Duplicate skill: ${skill.name}`);
    names.add(skill.name);
    if (
      !skill.description
      || !skill.vi?.summary
      || !skill.vi?.advantages?.length
      || !skill.vi?.limitations?.length
      || !skill.source
      || !skill.sourceHash
    ) {
      throw new Error(`Incomplete skill entry: ${skill.name}`);
    }
    if (!['public-root', 'nested', 'bundled'].includes(skill.scope)) {
      throw new Error(`Unknown skill scope: ${skill.name}/${skill.scope || 'missing'}`);
    }
    if (['nested', 'bundled'].includes(skill.scope) && !skill.parent) {
      throw new Error(`Nested/bundled skill has no parent: ${skill.name}`);
    }
    const currentHeadings = extractHeadings(parseFrontmatter(skill.source, skill.sourcePath).body);
    if (JSON.stringify(skill.headings) !== JSON.stringify(currentHeadings)) {
      throw new Error(`Incomplete or stale branch index: ${skill.name}`);
    }
    for (const branch of skill.operationalBranches || []) {
      if (!branch.id || !branch.titleVi || !branch.summaryVi || !branch.childrenVi?.length) {
        throw new Error(`Incomplete operational branch: ${skill.name}/${branch.id || 'unknown'}`);
      }
    }
  }
  const publicNames = new Set(catalog.skills.map((skill) => skill.name));
  const auxiliaryNames = new Set(catalog.auxiliary.map((item) => item.name));
  for (const item of catalog.auxiliary) {
    if (names.has(item.name)) throw new Error(`Public/auxiliary name collision: ${item.name}`);
    names.add(item.name);
    if (
      !item.kind
      || !item.status
      || !item.sourcePath
      || !item.vi?.summary
      || !item.vi?.advantages?.length
      || !item.vi?.limitations?.length
      || !item.headings?.length
    ) {
      throw new Error(`Incomplete auxiliary entry: ${item.name}`);
    }
  }
  const assigned = (catalog.groups || GROUPS).flatMap((group) => group.skills).filter((name) => publicNames.has(name));
  if (assigned.length !== catalog.skills.length || assigned.some((name) => !names.has(name))) {
    throw new Error('Catalog group assignment does not match the discovered skills');
  }
  for (const skill of catalog.skills.filter((item) => item.parent)) {
    if (!publicNames.has(skill.parent)) {
      throw new Error(`Nested skill parent is missing: ${skill.name} -> ${skill.parent}`);
    }
  }
  const assignedAuxiliary = (catalog.groups || GROUPS).flatMap((group) => group.skills).filter((name) => auxiliaryNames.has(name));
  if (assignedAuxiliary.length !== catalog.auxiliary.length) {
    throw new Error('Catalog group assignment does not match auxiliary capabilities');
  }
  for (const relation of catalog.relationships) {
    if (!names.has(relation.from) || !names.has(relation.to)) {
      throw new Error(`Relationship has unknown endpoint: ${relation.from} -> ${relation.to}`);
    }
    if (!relation.kind || !Array.isArray(relation.sourceRefs) || relation.sourceRefs.length === 0) {
      throw new Error(`Relationship lacks provenance: ${relation.from} -> ${relation.to}`);
    }
    for (const sourceRef of relation.sourceRefs) validateSourceRef(root, relation, sourceRef);
  }
  for (const flow of catalog.flows) {
    for (const name of flow.nodes || []) {
      if (!names.has(name)) throw new Error(`Flow has unknown node: ${flow.id}/${name}`);
    }
    for (const sourceRef of flow.sourceRefs || []) validateSourceRef(root, { from: flow.id, to: flow.id }, sourceRef);
  }
  if (catalog.summary.skillCount !== catalog.skills.length) throw new Error('summary.skillCount mismatch');
  const publicSkillCount = catalog.skills.filter((skill) => skill.scope === 'public-root').length;
  const nestedSkillCount = catalog.skills.filter((skill) => skill.scope === 'nested').length;
  const bundledSkillCount = catalog.skills.filter((skill) => skill.scope === 'bundled').length;
  if (catalog.summary.publicSkillCount !== publicSkillCount) throw new Error('summary.publicSkillCount mismatch');
  if (catalog.summary.nestedSkillCount !== nestedSkillCount) throw new Error('summary.nestedSkillCount mismatch');
  if (catalog.summary.bundledSkillCount !== bundledSkillCount) throw new Error('summary.bundledSkillCount mismatch');
  if (catalog.summary.excludedSkillFileCount !== (catalog.inventory?.excludedSkillFiles?.length || 0)) {
    throw new Error('summary.excludedSkillFileCount mismatch');
  }
  if (catalog.summary.auxiliaryCount !== catalog.auxiliary.length) throw new Error('summary.auxiliaryCount mismatch');
  const publicBranchCount = catalog.skills
    .filter((skill) => skill.scope === 'public-root')
    .reduce((sum, skill) => sum + skill.headings.length, 0);
  const nestedBranchCount = catalog.skills
    .filter((skill) => skill.scope === 'nested')
    .reduce((sum, skill) => sum + skill.headings.length, 0);
  const bundledBranchCount = catalog.skills
    .filter((skill) => skill.scope === 'bundled')
    .reduce((sum, skill) => sum + skill.headings.length, 0);
  const auxiliaryBranchCount = catalog.auxiliary.reduce((sum, item) => sum + item.headings.length, 0);
  if (catalog.summary.publicBranchCount !== publicBranchCount) {
    throw new Error('summary.publicBranchCount mismatch');
  }
  if (catalog.summary.auxiliaryBranchCount !== auxiliaryBranchCount) {
    throw new Error('summary.auxiliaryBranchCount mismatch');
  }
  if (catalog.summary.nestedBranchCount !== nestedBranchCount) {
    throw new Error('summary.nestedBranchCount mismatch');
  }
  if (catalog.summary.bundledBranchCount !== bundledBranchCount) {
    throw new Error('summary.bundledBranchCount mismatch');
  }
  if (catalog.summary.branchCount !== publicBranchCount + nestedBranchCount + bundledBranchCount + auxiliaryBranchCount) {
    throw new Error('summary.branchCount mismatch');
  }
}

function buildCatalog(root) {
  const { skills, excludedSkillFiles } = collectSkills(root);
  const flows = resolveEvidenceLines(FLOWS, root);
  const relationships = resolveEvidenceLines(RELATIONSHIPS, root);
  const sourceDigest = crypto
    .createHash('sha256')
    .update(skills.map((skill) => `${skill.sourcePath}:${skill.sourceHash}`).join('\n'))
    .digest('hex');
  const catalog = {
    schemaVersion: 1,
    kind: 'qa-skill-catalog',
    repository: path.basename(root),
    presentationUpstream: {
      repository: 'https://github.com/plannotator/effective-html',
      revision: '63b1bf04d3e48b426a31fdb82b1319c33663fde4',
      license: 'MIT',
    },
    sourceDigest,
    inventory: {
      policy: SKILL_INVENTORY_POLICY,
      includedSkillFiles: skills.map((skill) => skill.sourcePath),
      excludedSkillFiles,
    },
    summary: {
      skillCount: skills.length,
      publicSkillCount: skills.filter((skill) => skill.scope === 'public-root').length,
      nestedSkillCount: skills.filter((skill) => skill.scope === 'nested').length,
      bundledSkillCount: skills.filter((skill) => skill.scope === 'bundled').length,
      excludedSkillFileCount: excludedSkillFiles.length,
      auxiliaryCount: AUXILIARY.length,
      publicBranchCount: skills
        .filter((skill) => skill.scope === 'public-root')
        .reduce((sum, skill) => sum + skill.headings.length, 0),
      nestedBranchCount: skills
        .filter((skill) => skill.scope === 'nested')
        .reduce((sum, skill) => sum + skill.headings.length, 0),
      bundledBranchCount: skills
        .filter((skill) => skill.scope === 'bundled')
        .reduce((sum, skill) => sum + skill.headings.length, 0),
      auxiliaryBranchCount: AUXILIARY.reduce((sum, item) => sum + item.headings.length, 0),
      branchCount: [...skills, ...AUXILIARY].reduce((sum, item) => sum + item.headings.length, 0),
      operationalBranchCount: skills.reduce((sum, skill) => sum + skill.operationalBranches.length, 0),
      relationshipCount: relationships.length,
      groupCount: GROUPS.length,
      scriptCount: skills.reduce((sum, skill) => sum + skill.resources.scripts, 0),
      referenceCount: skills.reduce((sum, skill) => sum + skill.resources.references, 0),
      assetCount: skills.reduce((sum, skill) => sum + skill.resources.assets, 0),
    },
    groups: GROUPS.map((group) => ({
      ...group,
      skills: [...new Set([
        ...group.skills,
        ...skills.filter((skill) => skill.group === group.id).map((skill) => skill.name),
      ])],
    })),
    flows,
    relationships,
    auxiliary: AUXILIARY,
    skills,
  };
  validateCatalog(catalog, root);
  return catalog;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function diagramLayout(catalog) {
  const positions = new Map();
  const zoneWidth = 310;
  const columnGap = 42;
  const startX = 38;
  const startY = 330;
  const nodeWidth = 270;
  const nodeHeight = 74;
  const nodeGap = 18;
  const maxRows = Math.max(...catalog.groups.map((group) => group.skills.length));
  const zoneHeight = 94 + maxRows * (nodeHeight + nodeGap);
  const nodeByName = new Map([...catalog.skills, ...catalog.auxiliary].map((item) => [item.name, item]));

  const zones = catalog.groups.map((group, groupIndex) => {
    const x = startX + groupIndex * (zoneWidth + columnGap);
    const nodes = group.skills.map((name, nodeIndex) => {
      const skill = nodeByName.get(name);
      if (!skill) throw new Error(`Layout node is missing: ${name}`);
      const y = startY + 64 + nodeIndex * (nodeHeight + nodeGap);
      const position = { x: x + 20, y, width: nodeWidth, height: nodeHeight, zoneX: x, zoneWidth, group: group.id };
      positions.set(name, position);
      return { skill, ...position };
    });
    return { group, x, y: startY, width: zoneWidth, height: zoneHeight, nodes };
  });
  return {
    zones,
    positions,
    width: startX * 2 + catalog.groups.length * zoneWidth + (catalog.groups.length - 1) * columnGap,
    height: startY + zoneHeight + 330,
    zoneBottom: startY + zoneHeight,
  };
}

function segments(points) {
  return points.slice(1).map((point, index) => [points[index], point]);
}

function segmentIntersectsRect(segment, rect, margin = 2) {
  const [[x1, y1], [x2, y2]] = segment;
  const left = rect.x - margin;
  const right = rect.x + rect.width + margin;
  const top = rect.y - margin;
  const bottom = rect.y + rect.height + margin;
  if (x1 === x2) return x1 > left && x1 < right && Math.max(y1, y2) > top && Math.min(y1, y2) < bottom;
  if (y1 === y2) return y1 > top && y1 < bottom && Math.max(x1, x2) > left && Math.min(x1, x2) < right;
  throw new Error('Only orthogonal diagram segments are supported');
}

function relationshipRoute(layout, relation, index) {
  const from = layout.positions.get(relation.from);
  const to = layout.positions.get(relation.to);
  const fromY = from.y + from.height / 2;
  const toY = to.y + to.height / 2;
  let points;

  if (from.group === to.group) {
    const useLeft = index % 2 === 0;
    const fromX = useLeft ? from.x : from.x + from.width;
    const toX = useLeft ? to.x : to.x + to.width;
    const gutterX = useLeft
      ? from.zoneX - 16 - (index % 4) * 5
      : from.zoneX + from.zoneWidth + 16 + (index % 4) * 5;
    points = [[fromX, fromY], [gutterX, fromY], [gutterX, toY], [toX, toY]];
  } else {
    const forward = from.x < to.x;
    const fromX = forward ? from.x + from.width : from.x;
    const toX = forward ? to.x : to.x + to.width;
    const sourceGutterX = forward ? from.x + from.width + 10 : from.x - 10;
    const targetGutterX = forward ? to.x - 10 : to.x + to.width + 10;
    const useTop = index % 2 === 0;
    const laneIndex = Math.floor(index / 2);
    const busY = useTop ? 286 - laneIndex * 24 : layout.zoneBottom + 46 + laneIndex * 24;
    points = [
      [fromX, fromY],
      [sourceGutterX, fromY],
      [sourceGutterX, busY],
      [targetGutterX, busY],
      [targetGutterX, toY],
      [toX, toY],
    ];
  }

  for (const [name, rect] of layout.positions) {
    if (name === relation.from || name === relation.to) continue;
    if (segments(points).some((segment) => segmentIntersectsRect(segment, rect))) {
      throw new Error(`Edge intersects unrelated node: ${relation.from} -> ${relation.to} crosses ${name}`);
    }
  }
  return points;
}

function renderSvg(catalog) {
  const layout = diagramLayout(catalog);
  const renderedRelationships = catalog.relationships
    .map((relation, index) => {
      const points = relationshipRoute(layout, relation, index);
      const longestHorizontal = segments(points)
        .filter(([[, y1], [, y2]]) => y1 === y2)
        .sort((a, b) => Math.abs(b[1][0] - b[0][0]) - Math.abs(a[1][0] - a[0][0]))[0];
      const [[labelX1, labelY], [labelX2]] = longestHorizontal;
      const from = layout.positions.get(relation.from);
      const to = layout.positions.get(relation.to);
      const labelWidth = Math.min(196, Math.max(82, relation.labelVi.length * 5.7 + 18));
      let labelCenterX = (labelX1 + labelX2) / 2;
      let labelCenterY = labelY;
      if (from.group === to.group) {
        const gutterX = points[1][0];
        labelCenterX = gutterX < from.zoneX
          ? gutterX - labelWidth / 2 - 7
          : gutterX + labelWidth / 2 + 7;
        labelCenterY = (points[1][1] + points[2][1]) / 2;
      }
      const provenance = relation.sourceRefs.map((ref) => `${ref.path}:${ref.line}`).join(', ');
      return {
        path: `<polyline class="edge" id="edge-${index}" data-flow="${escapeHtml(relation.flow)}" data-from="${escapeHtml(relation.from)}" data-to="${escapeHtml(relation.to)}" data-kind="${escapeHtml(relation.kind)}" points="${points.map((point) => point.join(',')).join(' ')}"><title>${escapeHtml(`${relation.from} → ${relation.to}: ${relation.labelVi} · ${provenance}`)}</title></polyline>`,
        label: `<g class="edge-label" data-flow="${escapeHtml(relation.flow)}" transform="translate(${labelCenterX} ${labelCenterY})">
  <rect x="${-labelWidth / 2}" y="-10" width="${labelWidth}" height="20" rx="6"></rect>
  <text x="0" y="3.5" text-anchor="middle">${escapeHtml(relation.labelVi)}</text>
</g>`,
      };
    });

  const zones = layout.zones
    .map(
      ({ group, x, y, width, height }) => `<g class="zone" data-group="${escapeHtml(group.id)}">
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18"></rect>
  <text class="zone-title" x="${x + 20}" y="${y + 28}">${escapeHtml(group.labelVi)}</text>
  <text class="zone-note" x="${x + 20}" y="${y + 47}">${escapeHtml(group.noteVi)}</text>
</g>`,
    )
    .join('\n');

  const nodes = layout.zones
    .flatMap(({ group, nodes: groupNodes }) =>
      groupNodes.map(({ skill, x: nodeX, y: nodeY, width: nodeWidth, height: nodeHeight }) => {
        const resourceCount = skill.resources.scripts + skill.resources.references + skill.resources.assets;
        const auxiliary = Boolean(skill.kind && skill.status);
        const meta = auxiliary
          ? `${skill.headings.length} nhánh · ${skill.status === 'retired' ? 'đã ngừng dùng' : skill.status === 'internal' ? 'engine nội bộ' : 'provider tùy chọn'}`
          : skill.operationalBranches?.length
            ? `${skill.operationalBranches.length} nhánh thực thi · ${resourceCount} tài nguyên`
            : `${skill.headings.length} mục năng lực · ${resourceCount} tài nguyên`;
        return `<g class="node group-${group.color}${auxiliary ? ' auxiliary-node' : ''}" tabindex="0" role="button" aria-label="${escapeHtml(skill.name)}" data-skill="${escapeHtml(skill.name)}" transform="translate(${nodeX} ${nodeY})">
  <rect width="${nodeWidth}" height="${nodeHeight}" rx="11"></rect>
  <text class="node-title" x="16" y="28">${escapeHtml(skill.title || skill.name)}</text>
  <text class="node-meta" x="16" y="50">${escapeHtml(meta)}</text>
  <circle class="node-dot" cx="${nodeWidth - 19}" cy="20" r="5"></circle>
</g>`;
      }),
    )
    .join('\n');

  return {
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    content: `<g id="svg-content">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" class="arrow-head"></path>
  </marker>
</defs>
${zones}
${renderedRelationships.map((item) => item.path).join('\n')}
${renderedRelationships.map((item) => item.label).join('\n')}
${nodes}
</g>`,
  };
}

function renderHtml(catalog, sourcePrefix = '..') {
  const svg = renderSvg(catalog);
  const embedded = JSON.stringify(catalog).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  const groupOptions = catalog.groups
    .map((group) => `<button class="filter-chip" data-group="${escapeHtml(group.id)}">${escapeHtml(group.labelVi)}</button>`)
    .join('');
  const flowChips = catalog.flows
    .map((flow) => `<button class="flow-chip" data-flow="${escapeHtml(flow.id)}">${escapeHtml(flow.labelVi)}</button>`)
    .join('');
  const flowCards = catalog.flows
    .map(
      (flow) => `<article class="route-card" data-route="${escapeHtml(flow.id)}">
  <p class="eyebrow">${escapeHtml(flow.id)}</p>
  <h3>${escapeHtml(flow.labelVi)}</h3>
  <p>${escapeHtml(flow.summaryVi)}</p>
  <ol>${flow.stepsVi.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
</article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<meta name="generator" content="QA-skill build-skill-catalog">
<meta name="effective-html-revision" content="${catalog.presentationUpstream.revision}">
<meta name="qa-skill-count" content="${catalog.summary.skillCount}">
<meta name="qa-source-digest" content="${catalog.sourceDigest}">
<title>QA-skill — kiến trúc, danh mục và định tuyến</title>
<script>
(function () {
  const saved = localStorage.getItem('qa-skill-catalog-theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
})();
</script>
<style>
:root {
  --bg:#faf9f5; --surface:#fff; --surface-2:#f0eee6; --ink:#141413; --body:#3d3d3a;
  --muted:#77766f; --line:#d1cfc5; --line-soft:#e6e3da; --clay:#d97757;
  --clay-soft:rgba(217,119,87,.11); --olive:#788c5d; --olive-soft:rgba(120,140,93,.13);
  --blue:#5b7e96; --blue-soft:rgba(91,126,150,.12); --gold:#b58b42; --gold-soft:rgba(181,139,66,.12);
  --shadow:0 16px 50px rgba(20,20,19,.09); --serif:ui-serif,Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; --mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
}
html.dark {
  --bg:#141413; --surface:#1f1f1d; --surface-2:#2a2a28; --ink:#faf9f5; --body:#d1cfc5;
  --muted:#9c9a92; --line:#3d3d3a; --line-soft:#2a2a28; --clay:#e48a6e;
  --clay-soft:rgba(228,138,110,.15); --olive:#9db07c; --olive-soft:rgba(157,176,124,.16);
  --blue:#7fa3bc; --blue-soft:rgba(127,163,188,.16); --gold:#d4b36f; --gold-soft:rgba(212,179,111,.15);
  --shadow:0 18px 60px rgba(0,0,0,.28);
}
*{box-sizing:border-box}
html{background:var(--bg);color-scheme:light}
html.dark{color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--body);font-family:var(--sans);-webkit-font-smoothing:antialiased}
button,input{font:inherit}
button{color:inherit}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;padding:13px 22px;border-bottom:1px solid var(--line-soft);background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(14px)}
.brand{min-width:220px}.brand h1{margin:0;color:var(--ink);font:500 20px/1.1 var(--serif)}.brand p{margin:4px 0 0;color:var(--muted);font:10px var(--mono);letter-spacing:.08em;text-transform:uppercase}
.tabs{display:flex;gap:5px}.tab,.theme,.icon-btn,.filter-chip,.flow-chip{border:1px solid var(--line);background:transparent;border-radius:999px;cursor:pointer}
.tab{padding:7px 12px;font:11px var(--mono);letter-spacing:.04em}.tab.active{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.spacer{flex:1}.search-wrap{position:relative;min-width:min(360px,30vw)}.search-wrap input{width:100%;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);padding:9px 12px 9px 34px;outline:none}
.search-wrap input:focus{border-color:var(--clay);box-shadow:0 0 0 3px var(--clay-soft)}.search-wrap span{position:absolute;left:12px;top:9px;color:var(--muted)}
.theme,.icon-btn{padding:8px 11px;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase}
.page{padding:22px}.view{display:none}.view.active{display:block}
.intro{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(320px,.7fr);gap:20px;margin-bottom:18px}
.intro-copy,.stats-panel,.stage-shell,.catalog-shell,.route-card{background:var(--surface);border:1px solid var(--line-soft);border-radius:15px}
.intro-copy{padding:24px 26px}.eyebrow{margin:0 0 8px;color:var(--clay);font:10px var(--mono);letter-spacing:.11em;text-transform:uppercase}
.intro h2{margin:0;color:var(--ink);font:500 clamp(27px,4vw,46px)/1.03 var(--serif);letter-spacing:-.035em;max-width:800px}
.intro-copy>p:last-child{max-width:760px;margin:14px 0 0;line-height:1.65}
.stats-panel{display:grid;grid-template-columns:repeat(2,1fr);overflow:hidden}.stat{padding:18px;border-bottom:1px solid var(--line-soft)}.stat:nth-child(odd){border-right:1px solid var(--line-soft)}
.stat strong{display:block;color:var(--ink);font:500 28px var(--serif)}.stat span{color:var(--muted);font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase}
.stage-shell{overflow:hidden}.stage-tools{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:11px 13px;border-bottom:1px solid var(--line-soft)}
.stage-tools .label{margin-right:4px;color:var(--muted);font:10px var(--mono);text-transform:uppercase;letter-spacing:.08em}
.flow-chip,.filter-chip{padding:6px 10px;color:var(--muted);font:10.5px var(--mono)}.flow-chip.active,.filter-chip.active{background:var(--clay-soft);border-color:var(--clay);color:var(--clay)}
.zoom-status{margin-left:auto;color:var(--muted);font:10px var(--mono)}.stage{position:relative;height:min(72vh,780px);min-height:520px;background-image:radial-gradient(var(--line-soft) .75px,transparent .75px);background-size:18px 18px;overflow:hidden;user-select:none;-webkit-user-select:none}
.stage svg{width:100%;height:100%;display:block;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}.stage svg.dragging{cursor:grabbing}
.zone>rect{fill:color-mix(in srgb,var(--surface) 74%,transparent);stroke:var(--line);stroke-width:1;stroke-dasharray:5 5}.zone-title{fill:var(--ink);font:600 13px var(--sans)}.zone-note{fill:var(--muted);font:10px var(--mono)}
.node{cursor:pointer;outline:none}.node rect{fill:var(--surface);stroke:var(--line);stroke-width:1.5;transition:opacity .15s,stroke .15s}.node:hover rect,.node:focus rect,.node.selected rect{stroke:var(--clay);stroke-width:2}
.node-title{fill:var(--ink);font:600 14px var(--sans)}.node-meta{fill:var(--muted);font:10px var(--mono)}.node-dot{fill:var(--muted)}
.group-clay .node-dot{fill:var(--clay)}.group-olive .node-dot{fill:var(--olive)}.group-blue .node-dot{fill:var(--blue)}.group-gold .node-dot{fill:var(--gold)}.group-violet .node-dot{fill:#9b79b4}.auxiliary-node rect{stroke-dasharray:5 3}
.edge{fill:none;stroke:var(--muted);stroke-width:1.35;opacity:.4;marker-end:url(#arrow);transition:opacity .18s,stroke .18s}.arrow-head{fill:var(--muted)}.edge-label{opacity:.96;pointer-events:none;transition:opacity .18s}.edge-label rect{fill:var(--surface);stroke:var(--line-soft);stroke-width:1}.edge-label text{fill:var(--muted);font:9.5px var(--mono)}
.stage.flowing .node{opacity:.22}.stage.flowing .edge,.stage.flowing .edge-label{opacity:.06}.stage.flowing .node.lit{opacity:1}.stage.flowing .edge.lit{opacity:1;stroke:var(--clay);stroke-width:2;stroke-dasharray:7 5;animation:march .9s linear infinite}.stage.flowing .edge-label.lit{opacity:1}.stage.flowing .edge-label.lit rect{stroke:var(--clay)}.stage.flowing .edge-label.lit text{fill:var(--clay)}
@keyframes march{to{stroke-dashoffset:-12}}
.stage-hint{position:absolute;left:12px;bottom:10px;padding:6px 9px;background:var(--surface);border:1px solid var(--line-soft);border-radius:7px;color:var(--muted);font:10px var(--mono);pointer-events:none}
.catalog-shell{padding:16px}.catalog-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.catalog-toolbar .count{margin-left:auto;color:var(--muted);font:11px var(--mono)}
.skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:11px}.skill-card{position:relative;padding:17px;border:1px solid var(--line-soft);border-radius:12px;background:var(--bg);cursor:pointer;transition:transform .14s,border-color .14s,box-shadow .14s}
.skill-card:hover,.skill-card:focus{transform:translateY(-2px);border-color:var(--clay);box-shadow:0 8px 24px rgba(20,20,19,.07);outline:none}.skill-card.hidden{display:none}
.skill-card h3{margin:4px 0 7px;color:var(--ink);font:600 16px var(--sans)}.skill-card .desc{display:-webkit-box;overflow:hidden;-webkit-line-clamp:3;-webkit-box-orient:vertical;margin:0;font-size:12.5px;line-height:1.55}
.skill-card .match{display:none;margin:11px 0 0;padding:9px 10px;border-left:2px solid var(--gold);background:var(--gold-soft);font:10.5px/1.5 var(--mono)}.skill-card .match.show{display:block}
.skill-card .meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;color:var(--muted);font:10px var(--mono)}.group-label{color:var(--clay);font:10px var(--mono);text-transform:uppercase;letter-spacing:.08em}
.empty{display:none;padding:48px 20px;text-align:center;color:var(--muted)}.empty.show{display:block}
.routes-head{max-width:780px;margin:5px 0 22px}.routes-head h2{margin:0;color:var(--ink);font:500 38px var(--serif)}.routes-head p{line-height:1.65}
.route-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.route-card{padding:20px}.route-card h3{margin:0 0 8px;color:var(--ink);font:500 21px var(--serif)}.route-card>p:not(.eyebrow){font-size:13px;line-height:1.55}.route-card ol{margin:16px 0 0;padding:0;list-style:none;counter-reset:steps}.route-card li{position:relative;padding:9px 0 9px 34px;border-top:1px solid var(--line-soft);font:11px/1.4 var(--mono);counter-increment:steps}.route-card li:before{content:counter(steps);position:absolute;left:0;top:7px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--surface-2);color:var(--clay)}
.drawer{position:fixed;z-index:40;top:0;right:0;width:min(620px,100vw);height:100vh;padding:22px;background:var(--surface);border-left:1px solid var(--line);box-shadow:var(--shadow);overflow:auto;transform:translateX(102%);transition:transform .22s ease}.drawer.open{transform:translateX(0)}
.backdrop{position:fixed;z-index:35;inset:0;background:rgba(20,20,19,.32);opacity:0;pointer-events:none;transition:opacity .2s}.backdrop.open{opacity:1;pointer-events:auto}
.drawer-close{position:sticky;top:0;float:right;z-index:2;background:var(--surface)}.drawer h2{margin:20px 45px 18px 0;color:var(--ink);font:500 32px var(--serif)}
.detail-block{margin:14px 0;padding:16px;border:1px solid var(--line-soft);border-radius:12px;background:var(--bg)}.detail-block h3{margin:0 0 8px;color:var(--ink);font:600 12px var(--sans)}.detail-block p{margin:0;font-size:14px;line-height:1.65}
.insight-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.insight{padding:15px;border:1px solid var(--line-soft);border-radius:12px}.insight.good{background:var(--olive-soft)}.insight.limit{background:var(--gold-soft)}.insight h3{margin:0 0 9px;color:var(--ink);font:600 12px var(--sans)}.insight ul{margin:0;padding-left:18px}.insight li{padding:3px 0;font-size:12.5px;line-height:1.5}
.branches{margin-top:12px;padding:16px;border:1px solid var(--line-soft);border-radius:12px;background:var(--bg)}.branches h3{margin:0 0 4px;color:var(--ink);font:600 12px var(--sans)}.branches .branch-count{margin:0 0 12px;color:var(--muted);font:10px var(--mono)}.branch-tree{margin:0;padding:0;list-style:none}.branch-tree li{position:relative;margin:0;padding:6px 8px 6px 24px;border-left:1px solid var(--line);font:12px/1.4 var(--sans)}.branch-tree li:before{content:"";position:absolute;left:0;top:14px;width:14px;border-top:1px solid var(--line)}.branch-tree .level-2{margin-left:0;color:var(--ink);font-weight:600}.branch-tree .level-3{margin-left:18px}.branch-tree .level-4{margin-left:36px;color:var(--muted)}
.operation-tree{display:grid;gap:9px;margin:0;padding:0;list-style:none}.operation-tree>li{padding:12px;border:1px solid var(--line-soft);border-radius:10px;background:var(--surface)}.operation-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.operation-title strong{color:var(--ink);font:600 13px var(--sans)}.operation-code{padding:3px 6px;border-radius:5px;background:var(--clay-soft);color:var(--clay);font:9px var(--mono)}.operation-tree p{margin:6px 0 8px;font-size:12px;line-height:1.5}.operation-children{display:flex;flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none}.operation-children li{padding:4px 7px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font:9.5px var(--mono)}
.search-hit{background:var(--gold-soft);color:var(--ink)}
@media(max-width:900px){.topbar{align-items:flex-start;flex-wrap:wrap}.brand{flex:1}.tabs{order:3;width:100%;overflow:auto}.search-wrap{min-width:220px}.page{padding:13px}.intro{grid-template-columns:1fr}.stage{height:70vh}.stage-tools .zoom-status{display:none}}
@media(max-width:560px){.search-wrap{order:4;width:100%}.intro-copy{padding:20px}.skill-grid{grid-template-columns:1fr}.stats-panel{grid-template-columns:1fr}.stat:nth-child(odd){border-right:0}.insight-grid{grid-template-columns:1fr}.stage{min-height:480px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.stage.flowing .edge.lit{animation:none}.drawer,.backdrop,.skill-card{transition:none}}
</style>
</head>
<body>
<header class="topbar">
  <div class="brand"><h1>QA-skill</h1><p>Effective HTML · kiến trúc và danh mục trong một file</p></div>
  <nav class="tabs" role="tablist" aria-label="Các chế độ xem">
    <button class="tab active" id="tab-architecture" role="tab" aria-selected="true" aria-controls="view-architecture" data-view="architecture">Kiến trúc</button>
    <button class="tab" id="tab-catalog" role="tab" aria-selected="false" aria-controls="view-catalog" data-view="catalog">Tất cả skill</button>
    <button class="tab" id="tab-routing" role="tab" aria-selected="false" aria-controls="view-routing" data-view="routing">Luồng định tuyến</button>
  </nav>
  <div class="spacer"></div>
  <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="globalSearch" type="search" placeholder="Tìm trong ${catalog.summary.skillCount} skill…" aria-label="Tìm kiếm toàn bộ skill"></label>
  <button class="theme" id="themeToggle" type="button">Giao diện</button>
</header>
<main class="page">
  <section class="view active" id="view-architecture" role="tabpanel" aria-labelledby="tab-architecture">
    <div class="intro">
      <div class="intro-copy">
        <p class="eyebrow">Một repository · ${catalog.summary.groupCount} nhóm năng lực</p>
        <h2>Mỗi luồng QA đều có skill chịu trách nhiệm và handoff rõ ràng</h2>
        <p>Một file duy nhất để xem kiến trúc, tra cứu ${catalog.summary.skillCount} skill trong scope (${catalog.summary.publicSkillCount} public + ${catalog.summary.nestedSkillCount} nested), ${catalog.summary.branchCount} mục cấu trúc và ${catalog.summary.operationalBranchCount} nhánh thực thi đã mô hình hóa.</p>
      </div>
      <div class="stats-panel" aria-label="Repository statistics">
        <div class="stat"><strong>${catalog.summary.skillCount}</strong><span>skill trong scope</span></div>
        <div class="stat"><strong>${catalog.summary.relationshipCount}</strong><span>handoff rõ ràng</span></div>
        <div class="stat"><strong>${catalog.summary.scriptCount}</strong><span>script đi kèm</span></div>
        <div class="stat"><strong>${catalog.summary.branchCount}</strong><span>mục H2–H4/phụ trợ</span></div>
      </div>
    </div>
    <div class="stage-shell">
      <div class="stage-tools">
        <span class="label">Làm nổi bật</span>
        <button class="flow-chip active" data-flow="all">Tất cả</button>
        ${flowChips}
        <span class="zoom-status" id="zoomStatus">100%</span>
        <button class="icon-btn" id="zoomOut" type="button" aria-label="Thu nhỏ sơ đồ">−</button>
        <button class="icon-btn" id="zoomIn" type="button" aria-label="Phóng to sơ đồ">+</button>
        <button class="icon-btn" id="zoomReset" type="button">Đặt lại</button>
      </div>
      <div class="stage" id="stage">
        <svg id="architectureSvg" viewBox="${svg.viewBox}" role="img" aria-label="Kiến trúc toàn bộ năng lực QA-skill và các handoff định tuyến">
          ${svg.content}
        </svg>
        <div class="stage-hint">kéo/cuộn 2 ngón: di chuyển · chụm/xòe hoặc −/+: zoom · bấm vào skill</div>
      </div>
    </div>
  </section>
  <section class="view" id="view-catalog" role="tabpanel" aria-labelledby="tab-catalog">
    <div class="catalog-shell">
      <div class="catalog-toolbar">
        <button class="filter-chip active" data-group="all">Tất cả năng lực</button>
        ${groupOptions}
        <span class="count" id="resultCount">${catalog.summary.skillCount} / ${catalog.summary.skillCount}</span>
      </div>
      <div class="skill-grid" id="skillGrid"></div>
      <div class="empty" id="emptyState">Không có skill phù hợp với nội dung tìm kiếm</div>
    </div>
  </section>
  <section class="view" id="view-routing" role="tabpanel" aria-labelledby="tab-routing">
    <div class="routes-head">
      <p class="eyebrow">Định tuyến xác định</p>
      <h2>Các luồng thường dùng</h2>
      <p>Các luồng này tóm tắt handoff rõ ràng trong router của repository. Link hoặc artifact sẽ chọn skill chịu trách nhiệm trước; thao tác ghi vẫn cần kiểm tra đúng target và đọc lại để xác minh.</p>
    </div>
    <div class="route-grid">${flowCards}</div>
  </section>
</main>
<div class="backdrop" id="backdrop"></div>
<aside class="drawer" id="drawer" aria-hidden="true" aria-label="Chi tiết skill">
  <button class="icon-btn drawer-close" id="drawerClose" type="button">Đóng</button>
  <div id="drawerBody"></div>
</aside>
<script type="application/json" id="catalogData">${embedded}</script>
<script>
const DATA = JSON.parse(document.getElementById('catalogData').textContent);
const byName = new Map([...DATA.skills, ...DATA.auxiliary].map(skill => [skill.name, skill]));
const groupById = new Map(DATA.groups.map(group => [group.id, group]));
const grid = document.getElementById('skillGrid');
const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('backdrop');
const search = document.getElementById('globalSearch');
let activeGroup = 'all';
let drawerTrigger = null;

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function searchText(skill) {
  const operations = (skill.operationalBranches || []).flatMap(item => [item.id, item.titleVi, item.summaryVi, ...item.childrenVi]);
  return [skill.name, skill.title, skill.vi.summary, ...skill.vi.advantages, ...skill.vi.limitations, ...operations, ...skill.headings.map(item => item.title)].join(' ').toLowerCase();
}
function matchingExcerpt(skill, query) {
  if (!query) return '';
  const operations = (skill.operationalBranches || []).flatMap(item => [item.id, item.titleVi, item.summaryVi, ...item.childrenVi]);
  return [skill.vi.summary, ...skill.vi.advantages, ...skill.vi.limitations, ...operations, ...skill.headings.map(item => item.title)]
    .find(item => item.toLowerCase().includes(query)) || '';
}
function renderCards() {
  grid.innerHTML = DATA.skills.map(skill => {
    const group = groupById.get(skill.group);
    return '<article class="skill-card" tabindex="0" role="button" data-skill="' + esc(skill.name) + '" data-group="' + esc(skill.group) + '">' +
      '<span class="group-label">' + esc(group.labelVi) + '</span>' +
      '<h3>' + esc(skill.name) + '</h3>' +
      '<p class="desc">' + esc(skill.vi.summary) + '</p>' +
      '<p class="match" aria-live="polite"></p>' +
      '<div class="meta"><span>' + ((skill.operationalBranches || []).length ? skill.operationalBranches.length + ' nhánh thực thi' : skill.headings.length + ' mục năng lực') + '</span><span>' + skill.resources.scripts + ' script</span><span>' + skill.resources.references + ' tài liệu</span><span>' + skill.resources.assets + ' asset</span></div>' +
    '</article>';
  }).join('');
  document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('click', () => openSkill(card.dataset.skill, card));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSkill(card.dataset.skill, card); }
    });
  });
}
function applyFilters() {
  const query = search.value.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('.skill-card').forEach(card => {
    const skill = byName.get(card.dataset.skill);
    const show = (activeGroup === 'all' || skill.group === activeGroup) && (!query || searchText(skill).includes(query));
    card.classList.toggle('hidden', !show);
    const match = card.querySelector('.match');
    const excerpt = show ? matchingExcerpt(skill, query) : '';
    match.textContent = excerpt;
    match.classList.toggle('show', Boolean(excerpt));
    if (show) visible += 1;
  });
  document.getElementById('resultCount').textContent = visible + ' / ' + DATA.skills.length;
  document.getElementById('emptyState').classList.toggle('show', visible === 0);
  document.querySelectorAll('#architectureSvg .node').forEach(node => {
    const skill = byName.get(node.dataset.skill);
    node.style.opacity = !query || searchText(skill).includes(query) ? '' : '.12';
  });
}
function openSkill(name, trigger) {
  const skill = byName.get(name);
  if (!skill) return;
  drawerTrigger = trigger || document.activeElement;
  const group = groupById.get(skill.group);
  document.querySelectorAll('.node').forEach(node => node.classList.toggle('selected', node.dataset.skill === name));
  document.getElementById('drawerBody').innerHTML =
    '<p class="eyebrow">' + esc(group.labelVi) + '</p>' +
    '<h2>' + esc(skill.title || skill.name) + '</h2>' +
    '<section class="detail-block">' +
      '<h3>Làm được gì</h3>' +
      '<p>' + esc(skill.vi.summary) + '</p>' +
    '</section>' +
    '<div class="insight-grid">' +
      '<section class="insight good"><h3>Ưu điểm</h3><ul>' +
        skill.vi.advantages.map(item => '<li>' + esc(item) + '</li>').join('') +
      '</ul></section>' +
      '<section class="insight limit"><h3>Hạn chế</h3><ul>' +
        skill.vi.limitations.map(item => '<li>' + esc(item) + '</li>').join('') +
      '</ul></section>' +
    '</div>' +
    ((skill.operationalBranches || []).length
      ? '<section class="branches operations">' +
          '<h3>Nhánh thực thi</h3>' +
          '<p class="branch-count">' + skill.operationalBranches.length + ' workflow nội bộ · ' +
            (skill.name === 'dynamic-web-exploratory'
              ? 'dynamic-web-exploratory tự thao tác browser và dùng observer cùng session'
              : skill.name === 'dynamic-mobile'
                ? 'Appium MCP thực thi UI; proxy engine được ủy quyền bắt traffic mobile'
                : 'được mô hình hóa từ workflow của skill') +
          '</p>' +
          '<ol class="operation-tree">' +
            skill.operationalBranches.map(item =>
              '<li>' +
                '<div class="operation-title"><strong>' + esc(item.titleVi) + '</strong><span class="operation-code">' + esc(item.id) + '</span></div>' +
                '<p>' + esc(item.summaryVi) + '</p>' +
                '<ul class="operation-children">' + item.childrenVi.map(child => '<li>' + esc(child) + '</li>').join('') + '</ul>' +
              '</li>'
            ).join('') +
          '</ol>' +
        '</section>'
      : '') +
    '<section class="branches">' +
      '<h3>Cấu trúc hướng dẫn</h3>' +
      '<p class="branch-count">' + skill.headings.length + ' mục H2–H4 · chỉ hiển thị tên mục, không đưa nội dung thô vào panel</p>' +
      '<ol class="branch-tree">' +
        skill.headings.map(item => '<li class="level-' + item.level + '">' + esc(item.title) + '</li>').join('') +
      '</ol>' +
    '</section>';
  drawer.classList.add('open');
  backdrop.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.getElementById('drawerClose').focus();
}
function closeDrawer() {
  drawer.classList.remove('open');
  backdrop.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  if (drawerTrigger && drawerTrigger.isConnected && typeof drawerTrigger.focus === 'function') drawerTrigger.focus();
}
renderCards();
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(item => {
    item.classList.toggle('active', item === tab);
    item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
  });
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'view-' + tab.dataset.view));
}));
document.querySelectorAll('.filter-chip').forEach(chip => chip.addEventListener('click', () => {
  activeGroup = chip.dataset.group;
  document.querySelectorAll('.filter-chip').forEach(item => item.classList.toggle('active', item === chip));
  applyFilters();
}));
search.addEventListener('input', () => {
  applyFilters();
  if (search.value && !document.getElementById('view-catalog').classList.contains('active')) {
    document.querySelector('.tab[data-view="catalog"]').click();
  }
});
document.querySelectorAll('.node').forEach(node => {
  node.addEventListener('click', () => openSkill(node.dataset.skill, node));
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSkill(node.dataset.skill, node); }
  });
});
document.querySelectorAll('.flow-chip').forEach(chip => chip.addEventListener('click', () => {
  document.querySelectorAll('.flow-chip').forEach(item => item.classList.toggle('active', item === chip));
  const flow = chip.dataset.flow;
  const stage = document.getElementById('stage');
  stage.classList.toggle('flowing', flow !== 'all');
  document.querySelectorAll('.edge').forEach(edge => edge.classList.toggle('lit', edge.dataset.flow === flow));
  document.querySelectorAll('.edge-label').forEach(label => label.classList.toggle('lit', label.dataset.flow === flow));
  const flowDefinition = DATA.flows.find(item => item.id === flow);
  const lit = new Set([
    ...DATA.relationships.filter(relation => relation.flow === flow).flatMap(relation => [relation.from, relation.to]),
    ...(flowDefinition?.nodes || []),
  ]);
  document.querySelectorAll('.node').forEach(node => node.classList.toggle('lit', lit.has(node.dataset.skill)));
}));
drawer.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const focusable = [...drawer.querySelectorAll('button,a[href],summary,[tabindex]:not([tabindex="-1"])')].filter(item => !item.hasAttribute('disabled'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
backdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
document.getElementById('themeToggle').addEventListener('click', () => {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('qa-skill-catalog-theme', dark ? 'dark' : 'light');
});

const svgEl = document.getElementById('architectureSvg');
const svgContent = document.getElementById('svg-content');
const zoomStatus = document.getElementById('zoomStatus');
let transform = { x: 0, y: 0, scale: 1 };
let drag = null;
let dragged = false;
let pressedNode = null;
function applyTransform() {
  svgContent.setAttribute('transform', 'translate(' + transform.x + ' ' + transform.y + ') scale(' + transform.scale + ')');
  zoomStatus.textContent = Math.round(transform.scale * 100) + '%';
}
function zoomAt(next, px, py) {
  const old = transform.scale;
  transform.x = px - (px - transform.x) * (next / old);
  transform.y = py - (py - transform.y) * (next / old);
  transform.scale = next;
  applyTransform();
}
function zoomBy(factor) {
  const view = svgEl.viewBox.baseVal;
  const next = Math.min(2.5, Math.max(.55, transform.scale * factor));
  zoomAt(next, view.width / 2, view.height / 2);
}
function svgPoint(clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  const view = svgEl.viewBox.baseVal;
  const x = Number.isFinite(clientX) && clientX > 0 ? clientX : rect.left + rect.width / 2;
  const y = Number.isFinite(clientY) && clientY > 0 ? clientY : rect.top + rect.height / 2;
  return {
    x: (x - rect.left) * (view.width / rect.width),
    y: (y - rect.top) * (view.height / rect.height),
  };
}
stage.addEventListener('wheel', event => {
  if (event.target.closest?.('.card')) return;
  event.preventDefault();
  const rect = svgEl.getBoundingClientRect();
  const view = svgEl.viewBox.baseVal;
  const sx = view.width / rect.width;
  const sy = view.height / rect.height;
  if (event.ctrlKey || event.metaKey) {
    event.stopPropagation();
    const point = svgPoint(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.01);
    const next = Math.min(2.5, Math.max(.55, transform.scale * factor));
    zoomAt(next, point.x, point.y);
    return;
  }
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
  transform.x -= event.deltaX * unit * sx;
  transform.y -= event.deltaY * unit * sy;
  applyTransform();
}, { passive:false, capture:true });
let gestureStartScale = 1;
stage.addEventListener('gesturestart', event => {
  if (event.target.closest?.('.card')) return;
  event.preventDefault();
  event.stopPropagation();
  gestureStartScale = transform.scale;
}, {passive:false});
stage.addEventListener('gesturechange', event => {
  if (event.target.closest?.('.card')) return;
  event.preventDefault();
  event.stopPropagation();
  const point = svgPoint(event.clientX, event.clientY);
  const gestureScale = Number.isFinite(event.scale) && event.scale > 0 ? event.scale : 1;
  const next = Math.min(2.5, Math.max(.55, gestureStartScale * gestureScale));
  zoomAt(next, point.x, point.y);
}, {passive:false});
stage.addEventListener('gestureend', event => {
  event.preventDefault();
  event.stopPropagation();
}, {passive:false});
svgEl.addEventListener('pointerdown', event => {
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  pressedNode = event.target.closest?.('.node') || null;
  drag = { x:event.clientX, y:event.clientY, tx:transform.x, ty:transform.y };
  dragged = false;
  try { svgEl.setPointerCapture(event.pointerId); } catch {}
  svgEl.classList.add('dragging');
});
svgEl.addEventListener('pointermove', event => {
  if (!drag) return;
  event.preventDefault();
  const rect = svgEl.getBoundingClientRect();
  const view = svgEl.viewBox.baseVal;
  const dx = (event.clientX - drag.x) * (view.width / rect.width);
  const dy = (event.clientY - drag.y) * (view.height / rect.height);
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) dragged = true;
  transform.x = drag.tx + dx;
  transform.y = drag.ty + dy;
  applyTransform();
});
svgEl.addEventListener('pointerup', event => {
  const activateNode = !dragged ? pressedNode : null;
  pressedNode = null;
  drag = null;
  svgEl.classList.remove('dragging');
  if (dragged || activateNode) {
    const stop = clickEvent => { clickEvent.stopPropagation(); svgEl.removeEventListener('click', stop, true); };
    svgEl.addEventListener('click', stop, true);
    setTimeout(() => svgEl.removeEventListener('click', stop, true), 80);
  }
  if (activateNode) openSkill(activateNode.dataset.skill, activateNode);
  try { svgEl.releasePointerCapture(event.pointerId); } catch {}
});
svgEl.addEventListener('pointercancel', () => {
  pressedNode = null;
  drag = null;
  svgEl.classList.remove('dragging');
});
document.getElementById('zoomOut').addEventListener('click', () => zoomBy(1 / 1.2));
document.getElementById('zoomIn').addEventListener('click', () => zoomBy(1.2));
document.getElementById('zoomReset').addEventListener('click', () => { transform = {x:0,y:0,scale:1}; applyTransform(); });
</script>
</body>
</html>`;
}

function renderArchitectureHtml(catalog, sourcePrefix = '..') {
  const svg = renderSvg(catalog);
  const embedded = JSON.stringify(catalog).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  const flowChips = catalog.flows
    .map((flow) => `<button class="chip" data-flow="${escapeHtml(flow.id)}">${escapeHtml(flow.labelVi)}</button>`)
    .join('');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<meta name="generator" content="QA-skill effective-html-diagram">
<meta name="effective-html-revision" content="${catalog.presentationUpstream.revision}">
<meta name="qa-skill-count" content="${catalog.summary.skillCount}">
<meta name="qa-source-digest" content="${catalog.sourceDigest}">
<title>QA-skill — kiến trúc tổng thể</title>
<script>
(function () {
  const saved = localStorage.getItem('qa-skill-architecture-theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
})();
</script>
<style>
:root {
  --bg:#faf9f5; --surface:#fff; --surface2:#f0eee6; --ink:#141413; --body:#3d3d3a;
  --muted:#87867f; --line:#d1cfc5; --line-soft:#e6e3da; --clay:#d97757;
  --clay-soft:rgba(217,119,87,.10); --olive:#788c5d; --olive-soft:rgba(120,140,93,.12);
  --gold:#c9a45c; --blue:#5b7e96; --zone:rgba(20,20,19,.025); --zone-line:#d1cfc5;
  --shadow:0 8px 28px rgba(20,20,19,.12); --serif:ui-serif,Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; --mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
}
html.dark {
  --bg:#141413; --surface:#1f1f1d; --surface2:#2a2a28; --ink:#faf9f5; --body:#d1cfc5;
  --muted:#87867f; --line:#3d3d3a; --line-soft:#2a2a28; --clay:#e48a6e;
  --clay-soft:rgba(228,138,110,.14); --olive:#9db07c; --olive-soft:rgba(157,176,124,.16);
  --gold:#d4b36f; --blue:#7fa3bc; --zone:rgba(250,249,245,.03); --zone-line:#3d3d3a;
  --shadow:0 10px 34px rgba(0,0,0,.32);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
html{background:var(--bg);color-scheme:light}html.dark{color-scheme:dark}
body{display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--body);font-family:var(--sans);-webkit-font-smoothing:antialiased}
button{color:inherit}
.bar{display:flex;align-items:center;gap:14px;flex:none;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid var(--line-soft)}
.brand h1{color:var(--ink);font:500 19px/1.05 var(--serif);letter-spacing:-.01em}.brand p{margin-top:4px;color:var(--muted);font:10.5px var(--mono);letter-spacing:.06em;text-transform:uppercase}
.spacer{flex:1}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip,.tool{border:1px solid var(--line);background:transparent;cursor:pointer}
.chip{padding:5px 11px;border-radius:999px;color:var(--muted);font:11px var(--mono);letter-spacing:.03em;transition:all .15s}.chip:hover{color:var(--ink);border-color:var(--muted)}.chip.on{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.tool{padding:5px 9px;border-radius:6px;color:var(--muted);font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase}.tool:hover{color:var(--ink);border-color:var(--muted)}
.zoom{min-width:46px;text-align:center;color:var(--muted);font:10px var(--mono)}
.stage{position:relative;flex:1;min-height:0;overflow:hidden;user-select:none;-webkit-user-select:none}.stage svg{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}.stage svg.dragging{cursor:grabbing}
.zone rect{fill:var(--zone);stroke:var(--zone-line);stroke-width:1;stroke-dasharray:5 5}.zone-title{fill:var(--muted);font:12px var(--mono);letter-spacing:.08em;text-transform:uppercase}.zone-note{fill:var(--muted);opacity:.75;font:10px var(--mono)}
.node{cursor:pointer;outline:none}.node rect{fill:var(--surface);stroke:var(--line);stroke-width:1.5;transition:stroke .15s,opacity .15s}.node:hover rect,.node:focus rect{stroke:var(--muted)}.node.selected rect{stroke:var(--clay);stroke-width:2}
.node-title{fill:var(--ink);font:600 14px var(--sans);pointer-events:none}.node-meta{fill:var(--muted);font:10px var(--mono);pointer-events:none}.node-dot{fill:var(--muted)}
.group-clay .node-dot{fill:var(--clay)}.group-olive .node-dot{fill:var(--olive)}.group-blue .node-dot{fill:var(--blue)}.group-gold .node-dot{fill:var(--gold)}.group-violet .node-dot{fill:#9b79b4}.auxiliary-node rect{stroke-dasharray:5 3}
.edge{fill:none;stroke:var(--muted);stroke-width:1.45;opacity:.52;marker-end:url(#arrow);transition:opacity .2s,stroke .2s}.arrow-head{fill:var(--muted)}.edge-label{opacity:.96;pointer-events:none;transition:opacity .2s}.edge-label rect{fill:var(--surface);stroke:var(--line-soft);stroke-width:1}.edge-label text{fill:var(--muted);font:10px var(--mono)}
.stage.flowing .edge,.stage.flowing .edge-label{opacity:.08}.stage.flowing .node{opacity:.25}.stage.flowing .zone{opacity:.42}.stage.flowing .edge.lit{opacity:1;stroke:var(--clay);stroke-width:2;stroke-dasharray:7 5;animation:march .9s linear infinite}.stage.flowing .edge-label.lit{opacity:1}.stage.flowing .edge-label.lit rect{stroke:var(--clay)}.stage.flowing .edge-label.lit text{fill:var(--clay)}.stage.flowing .node.lit{opacity:1}.stage.flowing .node.lit rect{stroke:var(--clay)}
@keyframes march{to{stroke-dashoffset:-12}}
.source{position:absolute;top:10px;right:16px;color:var(--muted);opacity:.82;font:10px var(--mono);pointer-events:none}
.card{position:absolute;z-index:4;max-width:390px;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}
.card[hidden]{display:none}.close{position:absolute;top:8px;right:8px;width:25px;height:25px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--muted);cursor:pointer}.close:hover{color:var(--ink);border-color:var(--muted)}
#detail{right:16px;bottom:16px;width:360px}#flowcard{left:16px;bottom:16px;width:430px}
.card .eyebrow{margin:0 32px 5px 0;color:var(--clay);font:10px var(--mono);letter-spacing:.08em;text-transform:uppercase}.card h2{margin-right:30px;color:var(--ink);font:500 18px var(--serif)}.card .meta{margin:3px 0 8px;color:var(--muted);font:10px var(--mono)}.card p{font-size:12.5px;line-height:1.55}.card ol{margin:8px 0 0 18px}.card li{padding:2px 0;font-size:12px;line-height:1.45}.card a{display:inline-block;margin-top:9px;color:var(--clay);font:10.5px var(--mono)}
.hint{position:absolute;left:16px;top:12px;padding:5px 8px;border:1px solid var(--line-soft);border-radius:6px;background:var(--surface);color:var(--muted);font:9.5px var(--mono);pointer-events:none}
@media(max-width:900px){body{overflow:auto}.bar{align-items:flex-start}.chips{order:3;width:100%;overflow:auto;flex-wrap:nowrap}.stage{min-height:72vh}#detail,#flowcard{position:static;width:auto;max-width:none;margin:10px 16px}.source{display:none}}
@media(prefers-reduced-motion:reduce){.stage.flowing .edge.lit{animation:none}}
</style>
</head>
<body>
<header class="bar">
  <div class="brand">
    <h1>QA-skill — kiến trúc tổng thể</h1>
    <p>${catalog.summary.skillCount} skill trong scope · ${catalog.summary.auxiliaryCount} capability nội bộ/phụ trợ · mapping có nguồn</p>
  </div>
  <div class="spacer"></div>
  <div class="chips" aria-label="Làm nổi bật luồng QA">
    <button class="chip on" data-flow="all">Tất cả</button>
    ${flowChips}
  </div>
  <span class="zoom" id="zoomStatus">100%</span>
  <button class="tool" id="zoomOut" type="button" aria-label="Thu nhỏ sơ đồ">−</button>
  <button class="tool" id="zoomIn" type="button" aria-label="Phóng to sơ đồ">+</button>
  <button class="tool" id="zoomReset" type="button">Đặt lại</button>
  <button class="tool" id="themeToggle" type="button">Giao diện</button>
</header>
<main class="stage" id="stage">
  <svg id="architectureSvg" viewBox="${svg.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kiến trúc năng lực QA-skill và các luồng định tuyến">
    ${svg.content}
  </svg>
  <div class="source">router AGENTS.md · ${catalog.summary.scriptCount} script · nguồn ${catalog.sourceDigest.slice(0, 10)}</div>
  <div class="hint">kéo/cuộn 2 ngón: di chuyển · chụm/xòe hoặc −/+: zoom · bấm vào skill</div>
  <aside class="card" id="flowcard" hidden aria-label="Chi tiết luồng">
    <button class="close" id="flowClose" type="button" aria-label="Đóng chi tiết luồng">×</button>
    <p class="eyebrow" id="flowKey">Luồng</p>
    <h2 id="flowTitle"></h2>
    <p id="flowSummary"></p>
    <ol id="flowSteps"></ol>
  </aside>
  <aside class="card" id="detail" aria-label="Chi tiết skill">
    <button class="close" id="detailClose" type="button" aria-label="Đóng chi tiết skill">×</button>
    <p class="eyebrow" id="detailGroup">Chi tiết skill</p>
    <h2 id="detailTitle">Bấm vào một skill</h2>
    <div class="meta" id="detailMeta">${catalog.summary.skillCount} skill trong scope · ${catalog.summary.auxiliaryCount} capability phụ trợ</div>
    <p id="detailBody">Mỗi mũi tên đều có provenance từ SKILL.md, reference hoặc setup metadata. Rê chuột lên đường nối để xem file và dòng nguồn.</p>
    <a id="detailLink" href="${sourcePrefix}/AGENTS.md">Mở router chuẩn ↗</a>
  </aside>
</main>
<script type="application/json" id="catalogData">${embedded}</script>
<script>
const DATA = JSON.parse(document.getElementById('catalogData').textContent);
const byName = new Map([...DATA.skills, ...DATA.auxiliary].map(skill => [skill.name, skill]));
const groupById = new Map(DATA.groups.map(group => [group.id, group]));
const stage = document.getElementById('stage');
const nodes = [...document.querySelectorAll('.node')];
const edges = [...document.querySelectorAll('.edge')];
const labels = [...document.querySelectorAll('.edge-label')];
const chips = [...document.querySelectorAll('.chip')];
const detail = document.getElementById('detail');
const flowcard = document.getElementById('flowcard');

function showSkill(name) {
  const skill = byName.get(name);
  if (!skill) return;
  const group = groupById.get(skill.group);
  nodes.forEach(node => node.classList.toggle('selected', node.dataset.skill === name));
  document.getElementById('detailGroup').textContent = group.labelVi;
  document.getElementById('detailTitle').textContent = skill.title || skill.name;
  document.getElementById('detailMeta').textContent = skill.status
    ? skill.status + ' · không phải public skill'
    : skill.metrics.lines + ' dòng · ' + skill.resources.scripts + ' script · ' + skill.resources.references + ' tài liệu tham chiếu · ' + skill.resources.assets + ' asset';
  document.getElementById('detailBody').textContent = skill.vi.summary;
  const link = document.getElementById('detailLink');
  link.href = '${sourcePrefix}/' + skill.sourcePath;
  link.textContent = 'Mở ' + skill.sourcePath + ' ↗';
  detail.hidden = false;
}
function setFlow(key) {
  chips.forEach(chip => chip.classList.toggle('on', chip.dataset.flow === key));
  edges.forEach(edge => edge.classList.toggle('lit', edge.dataset.flow === key));
  labels.forEach(label => label.classList.toggle('lit', label.dataset.flow === key));
  nodes.forEach(node => node.classList.remove('lit'));
  if (key === 'all') {
    stage.classList.remove('flowing');
    flowcard.hidden = true;
    return;
  }
  const flow = DATA.flows.find(item => item.id === key);
  const lit = new Set([
    ...DATA.relationships.filter(item => item.flow === key).flatMap(item => [item.from, item.to]),
    ...(flow.nodes || []),
  ]);
  nodes.forEach(node => node.classList.toggle('lit', lit.has(node.dataset.skill)));
  stage.classList.add('flowing');
  document.getElementById('flowKey').textContent = 'Luồng · ' + flow.id;
  document.getElementById('flowTitle').textContent = flow.labelVi;
  document.getElementById('flowSummary').textContent = flow.summaryVi;
  document.getElementById('flowSteps').innerHTML = flow.stepsVi.map(step => '<li>' + step.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])) + '</li>').join('');
  flowcard.hidden = false;
}
chips.forEach(chip => chip.addEventListener('click', () => setFlow(chip.dataset.flow)));
nodes.forEach(node => {
  node.addEventListener('click', () => showSkill(node.dataset.skill));
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showSkill(node.dataset.skill); }
  });
});
document.getElementById('detailClose').addEventListener('click', () => { detail.hidden = true; });
document.getElementById('flowClose').addEventListener('click', () => { flowcard.hidden = true; });
document.getElementById('themeToggle').addEventListener('click', () => {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('qa-skill-architecture-theme', dark ? 'dark' : 'light');
});

const svgEl = document.getElementById('architectureSvg');
const svgContent = document.getElementById('svg-content');
const zoomStatus = document.getElementById('zoomStatus');
let transform = {x:0,y:0,scale:1};
let drag = null;
let dragged = false;
let pressedNode = null;
function applyTransform() {
  svgContent.setAttribute('transform', 'translate(' + transform.x + ' ' + transform.y + ') scale(' + transform.scale + ')');
  zoomStatus.textContent = Math.round(transform.scale * 100) + '%';
}
function zoomAt(next, px, py) {
  const old = transform.scale;
  transform.x = px - (px - transform.x) * (next / old);
  transform.y = py - (py - transform.y) * (next / old);
  transform.scale = next;
  applyTransform();
}
function zoomBy(factor) {
  const view = svgEl.viewBox.baseVal;
  const next = Math.min(2.5, Math.max(.55, transform.scale * factor));
  zoomAt(next, view.width / 2, view.height / 2);
}
function svgPoint(clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  const view = svgEl.viewBox.baseVal;
  const x = Number.isFinite(clientX) && clientX > 0 ? clientX : rect.left + rect.width / 2;
  const y = Number.isFinite(clientY) && clientY > 0 ? clientY : rect.top + rect.height / 2;
  return {
    x: (x - rect.left) * (view.width / rect.width),
    y: (y - rect.top) * (view.height / rect.height),
  };
}
stage.addEventListener('wheel', event => {
  if (event.target.closest?.('.card')) return;
  event.preventDefault();
  const rect = svgEl.getBoundingClientRect();
  const view = svgEl.viewBox.baseVal;
  const sx = view.width / rect.width;
  const sy = view.height / rect.height;
  if (event.ctrlKey || event.metaKey) {
    event.stopPropagation();
    const point = svgPoint(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.01);
    const next = Math.min(2.5, Math.max(.55, transform.scale * factor));
    zoomAt(next, point.x, point.y);
    return;
  }
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
  transform.x -= event.deltaX * unit * sx;
  transform.y -= event.deltaY * unit * sy;
  applyTransform();
}, {passive:false, capture:true});
let gestureStartScale = 1;
stage.addEventListener('gesturestart', event => {
  if (event.target.closest?.('.card')) return;
  event.preventDefault();
  event.stopPropagation();
  gestureStartScale = transform.scale;
}, {passive:false});
stage.addEventListener('gesturechange', event => {
  if (event.target.closest?.('.card')) return;
  event.preventDefault();
  event.stopPropagation();
  const point = svgPoint(event.clientX, event.clientY);
  const gestureScale = Number.isFinite(event.scale) && event.scale > 0 ? event.scale : 1;
  const next = Math.min(2.5, Math.max(.55, gestureStartScale * gestureScale));
  zoomAt(next, point.x, point.y);
}, {passive:false});
stage.addEventListener('gestureend', event => {
  event.preventDefault();
  event.stopPropagation();
}, {passive:false});
svgEl.addEventListener('pointerdown', event => {
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  pressedNode = event.target.closest?.('.node') || null;
  drag = {x:event.clientX,y:event.clientY,tx:transform.x,ty:transform.y};
  dragged = false;
  try { svgEl.setPointerCapture(event.pointerId); } catch {}
  svgEl.classList.add('dragging');
});
svgEl.addEventListener('pointermove', event => {
  if (!drag) return;
  event.preventDefault();
  const rect = svgEl.getBoundingClientRect();
  const view = svgEl.viewBox.baseVal;
  const dx = (event.clientX - drag.x) * (view.width / rect.width);
  const dy = (event.clientY - drag.y) * (view.height / rect.height);
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) dragged = true;
  transform.x = drag.tx + dx;
  transform.y = drag.ty + dy;
  applyTransform();
});
svgEl.addEventListener('pointerup', event => {
  const activateNode = !dragged ? pressedNode : null;
  pressedNode = null;
  drag = null;
  svgEl.classList.remove('dragging');
  if (dragged || activateNode) {
    const stop = clickEvent => { clickEvent.stopPropagation(); svgEl.removeEventListener('click', stop, true); };
    svgEl.addEventListener('click', stop, true);
    setTimeout(() => svgEl.removeEventListener('click', stop, true), 80);
  }
  if (activateNode) showSkill(activateNode.dataset.skill);
  try { svgEl.releasePointerCapture(event.pointerId); } catch {}
});
svgEl.addEventListener('pointercancel', () => {
  pressedNode = null;
  drag = null;
  svgEl.classList.remove('dragging');
});
document.getElementById('zoomOut').addEventListener('click', () => zoomBy(1 / 1.2));
document.getElementById('zoomIn').addEventListener('click', () => zoomBy(1.2));
document.getElementById('zoomReset').addEventListener('click', () => { transform={x:0,y:0,scale:1}; applyTransform(); });
</script>
</body>
</html>`;
}

function validateHtml(file, root = defaultRoot) {
  const html = readText(file);
  const required = [
    '<meta name="generator" content="QA-skill build-skill-catalog">',
    'id="catalogData"',
    'id="svg-content"',
    'id="themeToggle"',
    'qa-skill-catalog-theme',
    'id="globalSearch"',
    'id="drawerClose"',
    'id="zoomOut"',
    'id="zoomIn"',
    'id="zoomReset"',
    'Làm được gì',
    'Ưu điểm',
    'Hạn chế',
    'Nhánh thực thi',
    'Cấu trúc hướng dẫn',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`HTML validation failed; missing ${marker}`);
  }
  const match = html.match(/<script type="application\/json" id="catalogData">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('HTML validation failed; embedded catalog not found');
  const catalog = JSON.parse(match[1]);
  validateCatalog(catalog, root);
  for (const skill of catalog.skills) {
    const sourceFile = path.resolve(root, skill.sourcePath);
    if (!fs.existsSync(sourceFile)) throw new Error(`HTML validation failed; current source is missing: ${skill.sourcePath}`);
    const currentSource = readText(sourceFile);
    const currentHash = crypto.createHash('sha256').update(currentSource).digest('hex');
    if (currentHash !== skill.sourceHash || currentSource !== skill.source) {
      throw new Error(`HTML validation failed; embedded source is stale: ${skill.sourcePath}`);
    }
  }
  const allNodes = [...catalog.skills, ...catalog.auxiliary];
  if (allNodes.some((skill) => !html.includes(`data-skill="${escapeHtml(skill.name)}"`))) {
    throw new Error('HTML validation failed; one or more public/auxiliary nodes are absent from the SVG');
  }
  if (html.includes('Toàn bộ hướng dẫn nguồn') || html.includes('Mở nguồn chuẩn')) {
    throw new Error('HTML validation failed; detail panel still exposes SKILL.md content');
  }
  console.log(`PASS ${file}: one merged HTML with ${catalog.skills.length} skills, ${catalog.summary.branchCount} indexed branches, ${catalog.relationships.length} relationships and concise details`);
}

function validateArchitectureHtml(file, root = defaultRoot) {
  const html = readText(file);
  const required = [
    '<meta name="generator" content="QA-skill effective-html-diagram">',
    'id="catalogData"',
    'id="svg-content"',
    'id="themeToggle"',
    'qa-skill-architecture-theme',
    'id="detailClose"',
    'id="flowClose"',
    'id="zoomOut"',
    'id="zoomIn"',
    'id="zoomReset"',
    'preserveAspectRatio="xMidYMid meet"',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`Architecture HTML validation failed; missing ${marker}`);
  }
  const match = html.match(/<script type="application\/json" id="catalogData">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Architecture HTML validation failed; embedded catalog not found');
  const catalog = JSON.parse(match[1]);
  validateCatalog(catalog, root);
  for (const skill of catalog.skills) {
    const sourceFile = path.resolve(root, skill.sourcePath);
    if (!fs.existsSync(sourceFile)) throw new Error(`Architecture HTML validation failed; current source is missing: ${skill.sourcePath}`);
    const currentSource = readText(sourceFile);
    const currentHash = crypto.createHash('sha256').update(currentSource).digest('hex');
    if (currentHash !== skill.sourceHash || currentSource !== skill.source) {
      throw new Error(`Architecture HTML validation failed; embedded source is stale: ${skill.sourcePath}`);
    }
    if (!html.includes(`data-skill="${escapeHtml(skill.name)}"`)) {
      throw new Error(`Architecture HTML validation failed; SVG node is missing: ${skill.name}`);
    }
  }
  for (const item of catalog.auxiliary) {
    if (!html.includes(`data-skill="${escapeHtml(item.name)}"`)) {
      throw new Error(`Architecture HTML validation failed; auxiliary node is missing: ${item.name}`);
    }
  }
  renderSvg(catalog);
  if ((html.match(/class="chip(?: on)?"/g) || []).length !== catalog.flows.length + 1) {
    throw new Error('Architecture HTML validation failed; workflow chip count mismatch');
  }
  console.log(`PASS ${file}: full-screen Effective HTML diagram with ${catalog.skills.length} in-scope skills, ${catalog.auxiliary.length} auxiliary capabilities and ${catalog.flows.length} routed flows`);
}

function writeFile(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    validateHtml(path.resolve(args.root, args.check), args.root);
    return;
  }
  if (args.bundle) {
    const bundleDirectory = args.bundle.replace(/\/+$/, '');
    args.json = path.join(bundleDirectory, 'QA-skill-du-lieu.json');
    args.html = path.join(bundleDirectory, 'QA-skill.html');
  }
  const catalog = buildCatalog(args.root);
  const jsonPath = path.resolve(args.root, args.json);
  const htmlPath = path.resolve(args.root, args.html);
  const htmlSourcePrefix = path.relative(path.dirname(htmlPath), args.root).split(path.sep).join('/') || '.';
  writeFile(jsonPath, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFile(htmlPath, renderHtml(catalog, htmlSourcePrefix));
  validateCatalog(JSON.parse(readText(jsonPath)), args.root);
  validateHtml(htmlPath, args.root);
  console.log(`WROTE ${jsonPath}`);
  console.log(`WROTE ${htmlPath}`);
}

try {
  main();
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}
