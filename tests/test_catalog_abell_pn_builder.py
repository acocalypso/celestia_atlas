from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

import build_abell_pn_catalog as builder  # noqa: E402


HEADER = "a66_id\tmain_id\tra\tdec\totype\tidentifier\n"


def fixture_text() -> str:
    return HEADER + """"PN A66    1"\t"PN A66    1"\t3.25\t69.1\t"PN"\t"NGC  1"
"PN A66    1"\t"PN A66    1"\t3.25\t69.1\t"PN"\t"PN A66    1"
"PN A66    2"\t"Alias Main"\t11.4\t57.9\t"PN?"\t"PN A66    2"
"PN A66    2"\t"Alias Main"\t11.4\t57.9\t"PN?"\t"PK 122-04  1"
"""


class AbellPnBuilderTests(unittest.TestCase):
    def test_snapshot_parser_groups_exact_simbad_objects(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "a66.tsv"
            path.write_text(fixture_text(), encoding="utf-8", newline="\n")
            objects, rows = builder.load_snapshot(
                path,
                expected_source_rows=None,
                expected_objects=2,
            )

        self.assertEqual(rows, 4)
        self.assertEqual([obj["number"] for obj in objects], [1, 2])
        self.assertEqual(objects[0]["mainId"], "PN A66 1")
        self.assertEqual(objects[0]["identifiers"], {"NGC 1", "PN A66 1"})
        self.assertEqual(objects[1]["simbadOtype"], "PN?")

    def test_snapshot_parser_rejects_inconsistent_identity_and_missing_a66_id(self):
        inconsistent = HEADER + """"PN A66 1"\t"One"\t1\t2\t"PN"\t"PN A66 1"
"PN A66 1"\t"One"\t1.1\t2\t"PN"\t"PK 1+01 1"
"""
        missing_identifier = HEADER + (
            '"PN A66 1"\t"One"\t1\t2\t"PN"\t"PK 1+01 1"\n'
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "a66.tsv"
            path.write_text(inconsistent, encoding="utf-8", newline="\n")
            with self.assertRaisesRegex(ValueError, "inconsistent SIMBAD identity"):
                builder.load_snapshot(
                    path, expected_source_rows=None, expected_objects=1
                )

            path.write_text(missing_identifier, encoding="utf-8", newline="\n")
            with self.assertRaisesRegex(ValueError, "lacks exact SIMBAD identifier"):
                builder.load_snapshot(
                    path, expected_source_rows=None, expected_objects=1
                )

    def test_runtime_records_have_required_search_aliases_and_exact_merge_keys(self):
        objects = [
            {
                "number": 39,
                "mainId": "PN A66 39",
                "raDeg": 246.89,
                "decDeg": 27.91,
                "simbadOtype": "PN",
                "identifiers": {"PN A66 39", "IC 00972", "PK 047+42 1"},
            },
            {
                "number": 40,
                "mainId": "Other main",
                "raDeg": 246.89,
                "decDeg": 27.91,
                "simbadOtype": "?",
                "identifiers": {"PN A66 40", "NGC 1"},
            },
            {
                "number": 41,
                "mainId": "Third",
                "raDeg": 246.89,
                "decDeg": 27.91,
                "simbadOtype": "SNR",
                "identifiers": {"PN A66 41", "NGC 1"},
            },
        ]

        records = builder.compact_records(objects)
        first = records[0]
        self.assertEqual(first["id"], "Abell PN 39")
        self.assertTrue(
            {
                "Abell 39",
                "Abell39",
                "A66 39",
                "A66-39",
                "PN A66 39",
            }.issubset(first["aliases"])
        )
        self.assertEqual(first["mergeKeys"], ["ic:972"])
        self.assertEqual(first["properties"]["simbadMainId"], "PN A66 39")
        self.assertEqual(first["properties"]["simbadOtype"], "PN")
        self.assertIn("PK 047+42 1", first["crossIdentifiers"])

        # Identical positions are never merge evidence, and a repeated exact
        # NGC identity is deliberately too ambiguous to emit as a merge key.
        self.assertNotIn("mergeKeys", records[1])
        self.assertNotIn("mergeKeys", records[2])
        self.assertEqual(records[2]["typeCode"], "SNR")

    def test_pinned_snapshot_hash_counts_and_full_sequence(self):
        actual = builder.validate_source(builder.SNAPSHOT_PATH)
        objects, rows = builder.load_snapshot(builder.SNAPSHOT_PATH)

        self.assertEqual(actual, builder.SOURCE_SHA256)
        self.assertEqual(rows, 1_152)
        self.assertEqual(len(objects), 86)
        self.assertEqual([obj["number"] for obj in objects], list(range(1, 87)))
        self.assertEqual(sum(len(obj["identifiers"]) for obj in objects), 1_152)

    def test_metadata_and_browser_asset_preserve_odbl_boundary(self):
        records = builder.compact_records(
            [
                {
                    "number": 1,
                    "mainId": "PN A66 1",
                    "raDeg": 3.2,
                    "decDeg": 69.1,
                    "simbadOtype": "PN",
                    "identifiers": {"PN A66 1"},
                }
            ]
        )
        meta = builder.metadata(
            source_sha256="a" * 64,
            query_sha256="b" * 64,
            source_record_count=1,
            records=records,
            source_date_epoch=0,
        )
        script = builder.browser_script(meta, records)

        self.assertEqual(meta["versionLabel"], "SIMBAD A66")
        self.assertEqual(meta["license"], "ODbL-1.0")
        self.assertEqual(meta["retrievedAt"], "2026-07-15")
        self.assertEqual(meta["serviceRelease"], "SIMBAD4 1.8 - 2026-06")
        self.assertEqual(meta["generatedAt"], "1970-01-01T00:00:00+00:00")
        self.assertIn("No positional identity matching", meta["modifications"])
        self.assertIn("SPDX-License-Identifier: ODbL-1.0", script)
        self.assertIn("window.ABELL_PN_CATALOG_META=", script)
        self.assertIn("window.ABELL_PN_CATALOG_DATA=", script)
        self.assertNotIn("STELLARIUM_DSO", script)
        encoded = script.partition("window.ABELL_PN_CATALOG_META=")[2].partition(
            ";\n"
        )[0]
        self.assertEqual(json.loads(encoded)["sourceSha256"], "a" * 64)

    def test_source_manifest_matches_committed_query_and_response(self):
        manifest = json.loads(
            (builder.SNAPSHOT_PATH.parent / f"a66-{builder.SNAPSHOT_DATE}.meta.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["responseSha256"], builder.sha256_path(builder.SNAPSHOT_PATH))
        self.assertEqual(manifest["querySha256"], builder.sha256_path(builder.QUERY_PATH))
        self.assertEqual(manifest["objectCount"], 86)
        self.assertEqual(manifest["responseRowCount"], 1_152)

    def test_output_is_byte_reproducible(self):
        objects, source_rows = builder.load_snapshot(builder.SNAPSHOT_PATH)
        records = builder.compact_records(objects)
        meta = builder.metadata(
            source_sha256=builder.SOURCE_SHA256,
            query_sha256=builder.sha256_path(builder.QUERY_PATH),
            source_record_count=source_rows,
            records=records,
            source_date_epoch=0,
        )
        with tempfile.TemporaryDirectory() as left_dir, tempfile.TemporaryDirectory() as right_dir:
            left = builder.write_outputs(Path(left_dir), meta=meta, records=records)
            right = builder.write_outputs(Path(right_dir), meta=meta, records=records)
            for name in ("abell-pn-catalog.js", "abell-pn-catalog.json"):
                self.assertEqual(
                    hashlib.sha256(left[name].read_bytes()).digest(),
                    hashlib.sha256(right[name].read_bytes()).digest(),
                )


if __name__ == "__main__":
    unittest.main()
