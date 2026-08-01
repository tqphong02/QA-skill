from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("supply_checker", ROOT / "scripts/check_supply_chain.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SupplyChainTests(unittest.TestCase):
    def test_clean_manifest_is_pass(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / "package.json").write_text('{"name":"fixture","version":"1.0.0"}\n', encoding="utf-8")
            (repo / "src.js").write_text("const value = 'safe';\n", encoding="utf-8")
            report = MODULE.scan(repo)
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["dependency_manifests"], ["package.json"])

    def test_secret_is_redacted_and_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            secret = "ghp_" + "12345678901234567890"
            (repo / "src.js").write_text(
                f"const token = '{secret}';\n",
                encoding="utf-8",
            )
            report = MODULE.scan(repo)
        self.assertFalse(report["passed"])
        self.assertEqual(report["secret_findings"][0]["value"], "<redacted>")
        self.assertNotIn("12345678901234567890", str(report))


if __name__ == "__main__":
    unittest.main()
