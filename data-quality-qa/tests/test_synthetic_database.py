from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path


class SyntheticDatabaseFixtureTests(unittest.TestCase):
    def test_readonly_database_fixture_preserves_etl_values_and_rejects_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "etl_fixture.sqlite"
            writer = sqlite3.connect(database)
            writer.executescript(
                """
                CREATE TABLE etl_snapshot (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    event_time TEXT NOT NULL,
                    note TEXT
                );
                INSERT INTO etl_snapshot VALUES
                    ('DQ-001', 'Nguyễn An', '1234.50', '2026-07-26T08:30:00+07:00', NULL),
                    ('DQ-002', 'Zoë', '0.10', '2026-07-26T01:30:00Z', 'baseline'),
                    ('DQ-003', '李明', '99.99', '2026-07-26T09:45:00+07:00', 'incremental');
                """
            )
            writer.commit()
            writer.close()

            readonly = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
            rows = readonly.execute(
                "SELECT id, name, amount, event_time, note FROM etl_snapshot ORDER BY id"
            ).fetchall()
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[0][1], "Nguyễn An")
            self.assertEqual(rows[0][2], "1234.50")
            self.assertEqual(rows[0][3], "2026-07-26T08:30:00+07:00")
            self.assertIsNone(rows[0][4])
            self.assertEqual(rows[2][1], "李明")

            with self.assertRaisesRegex(sqlite3.OperationalError, "readonly"):
                readonly.execute(
                    "INSERT INTO etl_snapshot VALUES (?, ?, ?, ?, ?)",
                    ("DQ-004", "blocked", "0", "2026-07-26T10:00:00+07:00", None),
                )
            readonly.close()


if __name__ == "__main__":
    unittest.main()
