from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml


SKILL_ROOT = Path(__file__).resolve().parents[1]
CLI = SKILL_ROOT / "scripts" / "performance_orchestrator.py"


def base_config(engine: str, model: str = "concurrent-users") -> dict:
    workload = {
        "model": model,
        "users": 2,
        "rampUp": "2s",
        "holdDuration": "5s",
        "rampDown": "2s",
        "thinkTime": "1s",
    }
    if model == "request-rate":
        workload = {
            "model": model,
            "targetRate": 10,
            "timeUnit": "1s",
            "preAllocatedVUs": 2,
            "maxVUs": 5,
            "rampUp": "0s",
            "holdDuration": "5s",
            "rampDown": "0s",
            "thinkTime": "0s",
        }
    return {
        "engine": engine,
        "testType": "load",
        "target": {
            "environment": "qa",
            "baseUrl": "https://qa.example.com",
            "owner": "QA",
            "authorizationReference": "PERF-1",
            "production": False,
        },
        "workload": workload,
        "thresholds": {
            "p95Ms": 1000,
            "p99Ms": 2000,
            "maxErrorRate": 0.1,
            "minRequestsPerSecond": 1,
            "abortOnFailure": False,
        },
        "requests": [
            {
                "name": "Health",
                "method": "GET",
                "path": "/health",
                "expectedStatus": 200,
                "responseContains": "ok",
            }
        ],
        "safety": {
            "maxUsers": 100,
            "abortConditions": ["service health check fails"],
            "cleanup": "none",
            "monitoring": "fixture",
        },
        "report": {"html": True, "markdown": True, "json": True, "keepRawResult": True},
    }


class PerformanceOrchestratorTest(unittest.TestCase):
    def run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(CLI), *args],
            text=True,
            capture_output=True,
            check=False,
        )

    def write_config(self, root: Path, config: dict) -> Path:
        output = root / "run-config.yaml"
        output.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
        return output

    def test_prepare_jmeter_generates_importable_jmx_and_approval_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config_path = self.write_config(root, base_config("jmeter"))
            prepared = self.run_cli(
                "prepare",
                "--config",
                str(config_path),
                "--project-root",
                str(root),
                "--output-root",
                str(root / "artifacts"),
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            payload = json.loads(prepared.stdout)
            run_dir = Path(payload["runDir"])
            jmx = run_dir / "generated-test-plan.jmx"
            self.assertTrue(jmx.is_file())
            parsed = ET.parse(jmx).getroot()
            self.assertEqual(parsed.tag, "jmeterTestPlan")
            plan = json.loads((run_dir / "run-plan.json").read_text(encoding="utf-8"))
            self.assertEqual(plan["engine"], "jmeter")
            self.assertEqual(plan["enginePlan"]["mainCommand"][0], "jmeter")

            blocked = self.run_cli("run", "--run-dir", str(run_dir))
            self.assertEqual(blocked.returncode, 3)
            self.assertIn("APPROVAL_REQUIRED", blocked.stderr)

    def test_prepare_k6_request_rate_generates_scenario(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config_path = self.write_config(root, base_config("k6", "request-rate"))
            prepared = self.run_cli(
                "prepare",
                "--config",
                str(config_path),
                "--project-root",
                str(root),
                "--output-root",
                str(root / "artifacts"),
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            run_dir = Path(json.loads(prepared.stdout)["runDir"])
            script = (run_dir / "generated-test.js").read_text(encoding="utf-8")
            self.assertIn("constant-arrival-rate", script)
            self.assertIn("summaryTrendStats", script)
            self.assertIn("PERF_SMOKE", script)

    def test_auto_discovery_selects_single_k6_script(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = base_config("auto")
            config["script"] = {"path": None}
            config_path = self.write_config(root, config)
            (root / "load.js").write_text(
                "import http from 'k6/http';\n"
                "export const options = { vus: 1 };\n"
                "export default function () { http.get('https://qa.example.com/health'); }\n",
                encoding="utf-8",
            )
            validated = self.run_cli("validate", "--config", str(config_path))
            self.assertEqual(validated.returncode, 0, validated.stderr)
            payload = json.loads(validated.stdout)
            self.assertEqual(payload["engine"], "k6")
            self.assertTrue(payload["script"].endswith("load.js"))

            prepared = self.run_cli(
                "prepare",
                "--config",
                str(config_path),
                "--project-root",
                str(root),
                "--output-root",
                str(root / "artifacts"),
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            plan = json.loads(prepared.stdout)["plan"]
            adapted = Path(plan["enginePlan"]["script"])
            self.assertTrue(adapted.name.startswith("adapted-"))
            adapted_text = adapted.read_text(encoding="utf-8")
            self.assertIn('"target": 2', adapted_text)
            self.assertIn("sourceDefault(data)", adapted_text)
            self.assertNotIn("--vus", plan["enginePlan"]["smokeCommand"])

    def test_hardcoded_secret_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = base_config("k6")
            config["requests"][0]["body"] = {"password": "real-secret-value"}
            config_path = self.write_config(root, config)
            validated = self.run_cli("validate", "--config", str(config_path))
            self.assertEqual(validated.returncode, 2)
            self.assertIn("hardcoded secret", validated.stderr)

    def test_jtl_normalization_writes_three_common_reports(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config_path = self.write_config(root, base_config("jmeter"))
            jtl = root / "results.jtl"
            jtl.write_text(
                "timeStamp,elapsed,label,responseCode,responseMessage,success,failureMessage\n"
                "1000,100,GET /health,200,OK,true,\n"
                "1200,200,GET /health,200,OK,true,\n"
                "1500,1100,POST /checkout,500,Error,false,server error\n"
                "2800,1300,POST /checkout,200,OK,true,\n",
                encoding="utf-8",
            )
            normalized = self.run_cli(
                "normalize",
                "--engine",
                "jmeter",
                "--input",
                str(jtl),
                "--config",
                str(config_path),
                "--output-dir",
                str(root / "reports"),
            )
            self.assertEqual(normalized.returncode, 0, normalized.stderr)
            result = json.loads((root / "reports" / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "FAIL")
            self.assertEqual(result["summary"]["requests"], 4)
            self.assertEqual(result["slowestEndpoints"][0]["endpoint"], "POST /checkout")
            self.assertTrue((root / "reports" / "summary.md").is_file())
            self.assertTrue((root / "reports" / "summary.html").is_file())

    def test_k6_normalization_uses_common_thresholds(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config_path = self.write_config(root, base_config("k6"))
            summary = {
                "state": {"testRunDurationMs": 10000},
                "metrics": {
                    "http_reqs": {"values": {"count": 100, "rate": 10}},
                    "http_req_failed": {"values": {"rate": 0.01}},
                    "http_req_duration": {
                        "values": {"avg": 200, "p(90)": 400, "p(95)": 800, "p(99)": 1500}
                    },
                    "http_req_duration{endpoint:GET /health}": {
                        "values": {"p(95)": 800}
                    },
                },
            }
            raw = root / "k6.json"
            raw.write_text(json.dumps(summary), encoding="utf-8")
            normalized = self.run_cli(
                "normalize",
                "--engine",
                "k6",
                "--input",
                str(raw),
                "--config",
                str(config_path),
                "--output-dir",
                str(root / "reports"),
            )
            self.assertEqual(normalized.returncode, 0, normalized.stderr)
            result = json.loads((root / "reports" / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["summary"]["p99Ms"], 1500)
            self.assertEqual(result["summary"]["requestsPerSecond"], 10)

    def test_comparison_discloses_incompatible_workload(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline = {
                "status": "PASS",
                "environment": "qa",
                "testType": "load",
                "workload": {"model": "concurrent-users", "users": 10, "targetRate": 0},
                "summary": {
                    "p95Ms": 800,
                    "p99Ms": 1200,
                    "errorRate": 0.01,
                    "requestsPerSecond": 20,
                },
            }
            candidate = json.loads(json.dumps(baseline))
            candidate["workload"]["users"] = 20
            candidate["summary"]["p95Ms"] = 900
            baseline_path = root / "baseline.json"
            candidate_path = root / "candidate.json"
            baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
            candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
            compared = self.run_cli(
                "compare",
                "--baseline",
                str(baseline_path),
                "--candidate",
                str(candidate_path),
                "--output-dir",
                str(root / "comparison"),
            )
            self.assertEqual(compared.returncode, 0, compared.stderr)
            comparison = json.loads((root / "comparison" / "comparison.json").read_text(encoding="utf-8"))
            self.assertEqual(comparison["verdict"], "NOT_COMPARABLE")
            self.assertEqual(comparison["disclosedDifferences"][0]["field"], "workload.users")


if __name__ == "__main__":
    unittest.main()
