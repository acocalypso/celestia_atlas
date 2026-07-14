from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

import build_stellarium_supplement as builder  # noqa: E402
from catalog_model import CatalogObject, CatalogSourceRef, Coordinates  # noqa: E402


def supplement_object(
    uid: str,
    primary_name: str,
    *,
    aliases: tuple[str, ...] = (),
    cross_identifications: tuple[str, ...] = (),
    catalogue_groups: tuple[str, ...] = ("ldn",),
) -> CatalogObject:
    return CatalogObject(
        uid=uid,
        primary_name=primary_name,
        aliases=aliases,
        type_code="DrkN",
        coordinates=Coordinates(10.0, -20.0, original_frame="FK5/J2000"),
        sources=(
            CatalogSourceRef(
                "LDN via Stellarium",
                primary_name,
                table="nebulae/default/catalog.txt",
            ),
        ),
        catalogue_groups=catalogue_groups,
        cross_identifications=cross_identifications,
    )


class StellariumSupplementBuilderTests(unittest.TestCase):
    def test_compact_records_only_exposes_unique_ngc_and_ic_merge_keys(self):
        objects = (
            supplement_object(
                "stellarium:1",
                "LDN 1",
                aliases=("NGC 7000", "IC 5070", "Sh2-117"),
                cross_identifications=("NGC 7000", "IC 5070", "LDN 1"),
            ),
            supplement_object(
                "stellarium:2",
                "LDN 2",
                aliases=("NGC 1499", "Barnard 7"),
            ),
        )

        records = builder.compact_records(objects)

        self.assertEqual(records[0]["mergeKeys"], ["ic:5070", "ngc:7000"])
        self.assertEqual(records[1]["mergeKeys"], ["ngc:1499"])
        self.assertTrue(
            all(
                key.startswith(("ngc:", "ic:"))
                for record in records
                for key in record.get("mergeKeys", ())
            )
        )

    def test_repeated_ngc_or_ic_identity_is_omitted_from_every_source_row(self):
        objects = (
            supplement_object(
                "stellarium:10",
                "LDN 10",
                aliases=("NGC 2000", "IC 10"),
            ),
            supplement_object(
                "stellarium:11",
                "LDN 11",
                cross_identifications=("NGC2000", "IC 10"),
            ),
        )

        records = builder.compact_records(objects)

        self.assertNotIn("mergeKeys", records[0])
        self.assertNotIn("mergeKeys", records[1])

    def test_repeated_historical_catalogue_ids_are_never_merge_keys(self):
        objects = (
            supplement_object(
                "stellarium:20",
                "LDN 1730",
                aliases=("Sh2-249", "Barnard 1", "LBN 1"),
            ),
            supplement_object(
                "stellarium:21",
                "LDN 1730",
                aliases=("Sh 2-249", "B 1", "LBN1"),
            ),
        )

        records = builder.compact_records(objects)

        self.assertNotIn("mergeKeys", records[0])
        self.assertNotIn("mergeKeys", records[1])

    def test_browser_script_only_assigns_the_separate_supplement_globals(self):
        script = builder._browser_script(
            {"version": "v26.2", "objectCount": 1},
            [{"id": "LDN 1", "uid": "stellarium:1"}],
        )

        self.assertIn("window.STELLARIUM_DSO_SUPPLEMENT_META=", script)
        self.assertIn("window.STELLARIUM_DSO_SUPPLEMENT_DATA=", script)
        self.assertNotIn("window.DSO_DATA", script)
        self.assertNotIn("window.DSO_CATALOG_META", script)
        self.assertNotIn(".push(", script)
        self.assertIn("SPDX-License-Identifier: GPL-2.0-or-later", script)

    def test_metadata_records_pinned_release_provenance_and_content(self):
        objects = (
            supplement_object("stellarium:30", "LDN 30"),
            supplement_object(
                "stellarium:31",
                "RCW 31",
                catalogue_groups=("rcw", "sharpless"),
            ),
        )

        meta = builder._metadata(
            objects=objects,
            version="v26.2",
            source_sha256="a" * 64,
            source_date_epoch=0,
        )

        self.assertEqual(meta["version"], "v26.2")
        self.assertEqual(meta["catalogVersion"], "3.23")
        self.assertEqual(meta["license"], "GPL-2.0-or-later")
        self.assertEqual(meta["catalogueGroups"], ["ldn", "rcw", "sharpless"])
        self.assertEqual(meta["objectCount"], 2)
        self.assertEqual(meta["sourceSha256"], "a" * 64)
        self.assertEqual(meta["generatedAt"], "1970-01-01T00:00:00+00:00")
        self.assertIn("v26.2", meta["source"])
        self.assertIn("v26.2", meta["licenseUrl"])

    def test_prepare_source_validates_offline_file_hash(self):
        payload = b"pinned Stellarium fixture\n"
        digest = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.txt"
            path.write_bytes(payload)

            prepared, actual = builder.prepare_source(
                version="test-release",
                source_file=path,
                expected_sha256=digest,
                offline=True,
            )
            self.assertEqual(prepared, path)
            self.assertEqual(actual, digest)

            with self.assertRaisesRegex(RuntimeError, "expected sha256"):
                builder.prepare_source(
                    version="test-release",
                    source_file=path,
                    expected_sha256="0" * 64,
                    offline=True,
                )

    def test_prepare_source_offline_requires_an_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing.txt"
            with self.assertRaises(FileNotFoundError):
                builder.prepare_source(
                    version="test-release",
                    source_file=missing,
                    expected_sha256="0" * 64,
                    offline=True,
                )


if __name__ == "__main__":
    unittest.main()
