"""Unit tests for push_to_workspace.py."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "push_to_workspace.py"
SPEC = importlib.util.spec_from_file_location("push_to_workspace", MODULE_PATH)
assert SPEC and SPEC.loader
PUSH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUSH)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collection(name: str = "Test API") -> dict:
    return {
        "info": {
            "_postman_id": "00000000-0000-0000-0000-000000000000",
            "name": name,
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": [
            {
                "name": "Health",
                "request": {"method": "GET", "url": "{{baseUrl}}/health"},
                "event": [{"listen": "test", "script": {"exec": ["pm.test('ok', () => true);"]}}],
            }
        ],
    }


def _write_collection(directory: Path, content: dict | None = None) -> Path:
    p = directory / "col.json"
    p.write_text(json.dumps(content or _collection()), encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# API key validation
# ---------------------------------------------------------------------------


class ApiKeyTests(unittest.TestCase):
    def test_missing_key_raises(self):
        env = {k: v for k, v in os.environ.items() if k != "POSTMAN_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                PUSH._api_key()
            self.assertIn("POSTMAN_API_KEY", str(ctx.exception))

    def test_invalid_prefix_raises(self):
        with patch.dict(os.environ, {"POSTMAN_API_KEY": "invalid-key-value"}):
            with self.assertRaises(RuntimeError) as ctx:
                PUSH._api_key()
            self.assertIn("PMAK-", str(ctx.exception))

    def test_valid_key_returns(self):
        with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-abc123"}):
            self.assertEqual(PUSH._api_key(), "PMAK-abc123")

    def test_key_is_stripped(self):
        with patch.dict(os.environ, {"POSTMAN_API_KEY": "  PMAK-abc  "}):
            self.assertEqual(PUSH._api_key(), "PMAK-abc")


# ---------------------------------------------------------------------------
# load_collection
# ---------------------------------------------------------------------------


class LoadCollectionTests(unittest.TestCase):
    def test_valid_collection_loads(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            col = PUSH.load_collection(p)
            self.assertEqual(col["info"]["name"], "Test API")

    def test_missing_file_raises(self):
        with self.assertRaises(RuntimeError) as ctx:
            PUSH.load_collection(Path("/nonexistent/col.json"))
        self.assertIn("Cannot read", str(ctx.exception))

    def test_invalid_json_raises(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "bad.json"
            p.write_text("NOT JSON", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                PUSH.load_collection(p)

    def test_missing_schema_raises(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "bad.json"
            p.write_text(json.dumps({"info": {"name": "x"}, "item": []}), encoding="utf-8")
            with self.assertRaises(RuntimeError) as ctx:
                PUSH.load_collection(p)
            self.assertIn("schema", str(ctx.exception))

    def test_non_object_root_raises(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "arr.json"
            p.write_text("[]", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                PUSH.load_collection(p)


# ---------------------------------------------------------------------------
# cmd_push dry-run (no network)
# ---------------------------------------------------------------------------


class PushDryRunTests(unittest.TestCase):
    def test_dry_run_prints_collection_info_and_returns_zero(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp), _collection("Orders API"))
            ns = _args(p, dry_run=True)
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = PUSH.cmd_push(ns)
            self.assertEqual(code, 0)
            self.assertIn("DRY_RUN", stdout.getvalue())
            self.assertIn("Orders API", stdout.getvalue())

    def test_dry_run_with_collection_id_shows_update_operation(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            ns = _args(p, dry_run=True, collection_id="existing-id-123")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                PUSH.cmd_push(ns)
            self.assertIn("update", stdout.getvalue())

    def test_dry_run_without_collection_id_shows_create_operation(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            ns = _args(p, dry_run=True, collection_id="")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                PUSH.cmd_push(ns)
            self.assertIn("create", stdout.getvalue())

    def test_dry_run_invalid_collection_returns_error_code(self):
        ns = _args("/nonexistent/col.json", dry_run=True)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = PUSH.cmd_push(ns)
        self.assertEqual(code, 2)
        self.assertIn("BLOCKED", stderr.getvalue())


# ---------------------------------------------------------------------------
# cmd_push with mocked network
# ---------------------------------------------------------------------------


def _mock_workspace(ws_id: str = "ws-123") -> dict:
    return {"id": ws_id, "name": "Test Workspace", "type": "personal"}


def _mock_collection_response(col_id: str, col_name: str) -> dict:
    return {
        "collection": {
            "id": col_id,
            "uid": f"user-{col_id}",
            "info": {"name": col_name},
        }
    }


def _args(collection: str | Path, **overrides) -> "argparse.Namespace":
    import argparse
    return argparse.Namespace(
        collection=str(collection),
        workspace=overrides.get("workspace", "ws-123"),
        collection_id=overrides.get("collection_id", ""),
        dry_run=overrides.get("dry_run", False),
        apply=overrides.get("apply", not overrides.get("dry_run", False)),
        handler=PUSH.cmd_push,
    )


class PushNetworkTests(unittest.TestCase):
    def test_write_without_apply_is_blocked(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = PUSH.cmd_push(_args(p, apply=False))
            self.assertEqual(code, 2)
            self.assertIn("write_confirmation_required", stderr.getvalue())

    def test_missing_exact_workspace_is_blocked(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = PUSH.cmd_push(_args(p, workspace=""))
            self.assertEqual(code, 2)
            self.assertIn("exact_target_required", stderr.getvalue())

    def test_create_collection_success(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp), _collection("Test API"))
            ns = _args(p)

            with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-testkey"}), \
                 patch.object(PUSH, "get_workspace", return_value=_mock_workspace("ws-123")), \
                 patch.object(PUSH, "create_collection",
                              return_value=_mock_collection_response("col-abc", "Test API")), \
                 patch.object(PUSH, "get_collection",
                              return_value={"info": {"name": "Test API"}, "id": "col-abc"}):
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout):
                    code = PUSH.cmd_push(ns)
            self.assertEqual(code, 0)
            output = stdout.getvalue()
            self.assertIn("PASS", output)
            self.assertIn("col-abc", output)
            self.assertIn("URL", output)
            self.assertIn("web.postman.co", output)

    def test_update_collection_uses_put(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            ns = _args(p, collection_id="existing-col")

            with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-testkey"}), \
                 patch.object(PUSH, "get_workspace", return_value=_mock_workspace("ws-123")), \
                 patch.object(PUSH, "update_collection",
                              return_value=_mock_collection_response("existing-col", "Test API")) as mock_update, \
                 patch.object(PUSH, "get_collection",
                              return_value={"info": {"name": "Test API"}, "id": "existing-col"}):
                with contextlib.redirect_stdout(io.StringIO()):
                    code = PUSH.cmd_push(ns)
            self.assertEqual(code, 0)
            mock_update.assert_called_once()

    def test_missing_api_key_blocked(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            ns = _args(p)
            env = {k: v for k, v in os.environ.items() if k != "POSTMAN_API_KEY"}
            stderr = io.StringIO()
            with patch.dict(os.environ, env, clear=True), \
                 contextlib.redirect_stderr(stderr):
                code = PUSH.cmd_push(ns)
            self.assertEqual(code, 1)
            self.assertIn("BLOCKED", stderr.getvalue())

    def test_workspace_verification_failure_blocked(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            ns = _args(p)
            with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-testkey"}), \
                 patch.object(PUSH, "get_workspace",
                              side_effect=RuntimeError("workspace_not_found")):
                stderr = io.StringIO()
                with contextlib.redirect_stderr(stderr):
                    code = PUSH.cmd_push(ns)
            self.assertEqual(code, 1)
            self.assertIn("BLOCKED", stderr.getvalue())

    def test_push_network_error_fails(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp))
            ns = _args(p)
            with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-testkey"}), \
                 patch.object(PUSH, "get_workspace", return_value=_mock_workspace()), \
                 patch.object(PUSH, "create_collection",
                              side_effect=RuntimeError("HTTP 401 Unauthorized")):
                stderr = io.StringIO()
                with contextlib.redirect_stderr(stderr):
                    code = PUSH.cmd_push(ns)
            self.assertEqual(code, 1)
            self.assertIn("FAILED", stderr.getvalue())

    def test_read_back_mismatch_fails(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_collection(Path(tmp), _collection("Expected API"))
            ns = _args(p)
            with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-testkey"}), \
                 patch.object(PUSH, "get_workspace", return_value=_mock_workspace()), \
                 patch.object(PUSH, "create_collection",
                              return_value=_mock_collection_response("col-abc", "Expected API")), \
                 patch.object(PUSH, "get_collection",
                              return_value={"id": "col-abc", "info": {"name": "Wrong API"}}):
                stderr = io.StringIO()
                with contextlib.redirect_stderr(stderr), \
                     contextlib.redirect_stdout(io.StringIO()):
                    code = PUSH.cmd_push(ns)
            self.assertEqual(code, 1)
            self.assertIn("read_back_verification", stderr.getvalue())


# ---------------------------------------------------------------------------
# cmd_list_workspaces
# ---------------------------------------------------------------------------


class ListWorkspacesTests(unittest.TestCase):
    def test_lists_workspaces(self):
        import argparse
        ns = argparse.Namespace(handler=PUSH.cmd_list_workspaces)
        workspaces = [
            {"id": "ws-1", "name": "Personal", "type": "personal"},
            {"id": "ws-2", "name": "Team", "type": "team"},
        ]
        with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-testkey"}), \
             patch.object(PUSH, "list_workspaces", return_value=workspaces):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = PUSH.cmd_list_workspaces(ns)
        self.assertEqual(code, 0)
        output = stdout.getvalue()
        self.assertIn("PASS", output)
        self.assertIn("ws-1", output)
        self.assertIn("Personal", output)

    def test_missing_key_blocked(self):
        import argparse
        ns = argparse.Namespace(handler=PUSH.cmd_list_workspaces)
        env = {k: v for k, v in os.environ.items() if k != "POSTMAN_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = PUSH.cmd_list_workspaces(ns)
        self.assertEqual(code, 1)
        self.assertIn("BLOCKED", stderr.getvalue())

    def test_empty_workspace_list_notice(self):
        import argparse
        ns = argparse.Namespace(handler=PUSH.cmd_list_workspaces)
        with patch.dict(os.environ, {"POSTMAN_API_KEY": "PMAK-testkey"}), \
             patch.object(PUSH, "list_workspaces", return_value=[]):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = PUSH.cmd_list_workspaces(ns)
        self.assertEqual(code, 0)
        self.assertIn("NOTICE", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
