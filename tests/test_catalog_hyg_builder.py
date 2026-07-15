from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
import sys

sys.path.insert(0, str(TOOLS))

import build_hyg_star_catalog as builder  # noqa: E402


HEADER = "id,hip,proper,ra,dec,mag,ci,con\n"


class HygStarBuilderTests(unittest.TestCase):
    def test_load_selects_naked_eye_non_solar_records_and_compacts_fields(self):
        content = HEADER + """0,,Sol,0,0,-26.7,0.656,
1,10,Named Star,1.25,-2.5,6.5,0.42,Ari
2,,,2.5,3.5,6.49,,Tau
3,30,Faint Star,3.5,4.5,6.51,1.1,Ori
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "hyg.csv"
            path.write_text(content, encoding="utf-8")

            records, source_rows = builder.load_hyg_candidates(
                path,
                expected_source_rows=None,
                expected_eligible_rows=None,
            )

        self.assertEqual(source_rows, 4)
        self.assertEqual(len(records), 2)
        self.assertEqual(
            records[0],
            {
                "uid": "hyg:1",
                "hyg": 1,
                "id": "HIP 10",
                "name": "Named Star",
                "ra": 1.25,
                "dec": -2.5,
                "mag": 6.5,
                "con": "Ari",
                "catalogSource": "HYG",
                "named": True,
                "bv": 0.42,
            },
        )
        self.assertEqual(records[1]["id"], "HYG 2")
        self.assertEqual(records[1]["name"], "HYG 2")
        self.assertNotIn("named", records[1])
        self.assertNotIn("bv", records[1])

    def test_duplicate_filter_removes_every_close_component(self):
        candidates = [
            {"uid": "hyg:1", "ra": 5.0, "dec": 20.0},
            {"uid": "hyg:2", "ra": 5.0005, "dec": 20.0},
            {"uid": "hyg:3", "ra": 5.1, "dec": 20.0},
        ]
        curated = [{"name": "System", "ra": 5.0, "dec": 20.0}]

        kept, excluded = builder.exclude_curated_duplicates(candidates, curated)

        self.assertEqual([item["uid"] for item in kept], ["hyg:3"])
        self.assertEqual(
            [item["uid"] for item in excluded],
            ["hyg:1", "hyg:2"],
        )

    def test_curated_loader_reads_json_assignment_and_validates_coordinates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.js"
            path.write_text(
                '"use strict";\nwindow.STAR_DATA = '
                '[{"name":"One","ra":1.5,"dec":-4.0}];\n',
                encoding="utf-8",
            )
            self.assertEqual(builder.load_curated_stars(path)[0]["name"], "One")

            path.write_text(
                'window.STAR_DATA=[{"name":"Bad","ra":24,"dec":0}];',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "outside the sky"):
                builder.load_curated_stars(path)

    def test_prepare_source_validates_offline_file_hash(self):
        payload = b"pinned HYG fixture\n"
        digest = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "hyg.csv"
            path.write_bytes(payload)

            prepared, actual = builder.prepare_source(
                source_file=path,
                expected_sha256=digest,
                offline=True,
            )
            self.assertEqual(prepared, path)
            self.assertEqual(actual, digest)

            with self.assertRaisesRegex(RuntimeError, "expected sha256"):
                builder.prepare_source(
                    source_file=path,
                    expected_sha256="0" * 64,
                    offline=True,
                )

    def test_metadata_and_browser_script_preserve_license_boundary(self):
        records = [
            {
                "uid": "hyg:1",
                "hyg": 1,
                "id": "HIP 10",
                "name": "Named Star",
                "named": True,
            }
        ]
        meta = builder.metadata(
            source_sha256="a" * 64,
            source_record_count=100,
            eligible_record_count=2,
            records=records,
            curated_record_count=1,
            curated_excluded_count=1,
            source_date_epoch=0,
        )
        script = builder.browser_script(meta, records)

        self.assertEqual(meta["version"], "v4.1")
        self.assertEqual(meta["license"], "CC-BY-SA-4.0")
        self.assertEqual(meta["objectCount"], 1)
        self.assertEqual(meta["generatedAt"], "1970-01-01T00:00:00+00:00")
        self.assertIn(builder.SOURCE_COMMIT, meta["source"])
        self.assertIn("window.HYG_STAR_CATALOG_META=", script)
        self.assertIn("window.HYG_STAR_DATA=", script)
        self.assertNotIn("window.STAR_DATA=", script)
        self.assertIn("SPDX-License-Identifier: CC-BY-SA-4.0", script)
        encoded = script.partition("window.HYG_STAR_CATALOG_META=")[2].partition(";\n")[0]
        self.assertEqual(json.loads(encoded)["sourceSha256"], "a" * 64)


if __name__ == "__main__":
    unittest.main()
