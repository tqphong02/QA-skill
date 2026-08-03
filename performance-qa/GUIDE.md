# Guide dung performance-qa

Guide nay danh cho lan dau clone repo ve va muon dung mot skill performance duy nhat cho ca JMeter va k6.

## 1. Cai skill vao agent

Tu root repo:

```bash
./scripts/setup.sh --agent=codex --only=performance-qa --skip-deps --yes
```

Hoac cai vao Antigravity:

```bash
./scripts/setup.sh --agent=antigravity --only=performance-qa --skip-deps --yes
```

Mo phien agent moi sau khi cai. Skill nam trong repo chua co nghia la agent da discover duoc skill.

## 2. Cai runtime khi can chay that

Skill co the inspect, validate, generate script/report ma khong can runtime. Chi khi chay load that moi can engine:

```bash
k6 version
jmeter --version
java -version
```

Neu chi dung k6 thi khong can cai JMeter. Neu chi dung JMeter thi can Java va JMeter.

## 3. Kiem tra moi truong

```bash
cd performance-qa
python3 scripts/performance_orchestrator.py doctor
```

Doctor se bao ro `available`, `runtime_missing`, `mcp_not_configured` hoac loi auth/config. Dung ket qua nay truoc khi ket luan skill bi loi.

## 4. Flow chuan khi tao performance run

Tu folder `performance-qa`:

```bash
python3 scripts/performance_orchestrator.py wizard --output run-config.yaml
python3 scripts/performance_orchestrator.py validate --config run-config.yaml
python3 scripts/performance_orchestrator.py prepare --config run-config.yaml --project-root . --output-root artifacts
```

Sau `prepare`, doc lai:

- `artifacts/<run-id>/run-config.yaml`
- `artifacts/<run-id>/run-plan.json`

Chi khi workload, target, thresholds va command da dung moi chay:

```bash
python3 scripts/performance_orchestrator.py run --run-dir artifacts/<run-id> --approve-load
```

Main load luon bi chan neu smoke mot user fail.

## 5. Config chung cho JMeter va k6

Dung mot file YAML chung, khong tao hai contract rieng. Bat dau tu:

```bash
cp assets/run-config.example.yaml run-config.yaml
```

Truong quan trong:

- `engine`: `auto`, `jmeter`, hoac `k6`
- `testType`: `smoke`, `load`, `stress`, `spike`, `soak`, `volume`, `scalability`
- `target.baseUrl`: URL can test
- `target.owner`: nguoi/team owner
- `target.authorizationReference`: ticket/email/approval cho phep test
- `workload.model`: `concurrent-users`, `request-rate`, hoac `total-iterations`
- `thresholds`: p95, p99, error rate, throughput
- `safety.abortConditions`: dieu kien dung test

Neu `testType: volume`, them `dataProfile` voi dataset reference, so record
hoac payload size, cleanup va integrity check. Neu `testType: scalability`, tao
mot config cho moi resource profile, giu cung `comparisonGroup`, roi compare
baseline/candidate sau khi ca hai run da co result

Khong hardcode token, password, cookie, API key trong YAML, JMX, k6 script, command, log hoac report. Dung placeholder kieu `${TOKEN}`.

## 6. Khi nao skill tu chon JMeter hay k6

- Co file `.jmx` ro rang: dung JMeter
- Co file k6 `.js`, `.ts`, `.mjs` ro rang: dung k6
- `engine: auto` va project chi co mot engine: dung engine do
- Neu co ca JMeter va k6, hoac khong co script nao: agent phai hoi chon engine, khong duoc doan

Bare file `.jmx`, JTL, k6 script, hoac result JSON chi cho phep inspect/validate. No khong phai la approval de chay load.

## 7. Vi du k6 nhanh

`run-config.yaml`:

```yaml
engine: k6
testType: load
target:
  environment: qa
  baseUrl: https://qa.example.com
  owner: qa-team
  authorizationReference: PERF-001
  production: false
workload:
  model: concurrent-users
  users: 10
  rampUp: 30s
  holdDuration: 2m
  rampDown: 30s
  thinkTime: 1s
thresholds:
  p95Ms: 1000
  p99Ms: 2000
  maxErrorRate: 0.01
  minRequestsPerSecond: 1
  abortOnFailure: false
requests:
  - name: Health
    method: GET
    path: /health
    expectedStatus: 200
    responseContains: ok
safety:
  maxUsers: 100
  abortConditions:
    - error rate exceeds agreed limit
  cleanup: no mutated test data
  monitoring: service dashboard
report:
  html: true
  markdown: true
  json: true
  keepRawResult: true
```

Lenh:

```bash
python3 scripts/performance_orchestrator.py validate --config run-config.yaml
python3 scripts/performance_orchestrator.py prepare --config run-config.yaml --project-root . --output-root artifacts
```

## 8. Vi du JMeter nhanh

Chon `engine: jmeter` trong `run-config.yaml`. Neu co JMX san:

```yaml
engine: jmeter
script:
  path: tests/performance/login.jmx
```

Neu chua co JMX, khai bao `requests` trong YAML, skill se generate JMX tu config chung.

## 9. Ket qua can ban giao

Sau khi run hoac normalize result, output can co:

- `result.json`
- `summary.md`
- `summary.html`
- raw JTL hoac k6 summary JSON neu `keepRawResult: true`
- engine-native report khi runtime ho tro

PASS/FAIL phai khop giua JSON, Markdown va HTML. Claim ve bottleneck chi duoc ghi khi co evidence tu latency/error va monitoring lien quan.

## 10. Lenh huu ich

Discover project:

```bash
python3 scripts/performance_orchestrator.py discover --root <project-root>
```

Normalize JMeter JTL:

```bash
python3 scripts/performance_orchestrator.py normalize --engine jmeter --input result.jtl --output artifacts/result.json
```

Normalize k6 summary JSON:

```bash
python3 scripts/performance_orchestrator.py normalize --engine k6 --input summary.json --output artifacts/result.json
```

Compare hai lan run:

```bash
python3 scripts/performance_orchestrator.py compare --base artifacts/base/result.json --candidate artifacts/new/result.json --output artifacts/compare
```

Neu environment, dataset, cache state hoac workload khac nhau, compare phai ghi `NOT_COMPARABLE`.
