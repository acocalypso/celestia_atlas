from __future__ import annotations

import json
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
FIXTURES = Path(__file__).with_name("fixtures") / "catalog_sources"
sys.path.insert(0, str(TOOLS))

from catalog_sources import barnard, dcld, feitzinger, lbn, ldn, rcw, sharpless, vdb  # noqa: E402
from catalog_sources.base import SourceRowError, read_vizier_tsv  # noqa: E402
from build_dso_catalog import _selected_manifest, _verify_cached_source  # noqa: E402


class SourceImporterTests(unittest.TestCase):
    def test_required_notes_table_cannot_be_silently_omitted(self):
        source = (FIXTURES / "barnard.tsv").read_bytes()
        policy = {
            "catalogues": {
                "barnard": {
                    "canonicalSha256": hashlib.sha256(source).hexdigest(),
                    "notesCanonicalSha256": "unused-when-missing",
                }
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "barnard.tsv").write_bytes(source)
            with self.assertRaisesRegex(FileNotFoundError, "including its notes table"):
                _verify_cached_source("barnard", path, policy)

    def test_ldn_parses_opacity_area_aliases_and_true_b1950(self):
        obj = ldn.load(FIXTURES / "ldn.tsv", strict=False)[0]
        self.assertEqual(obj.primary_name, "LDN 1")
        self.assertIn("LDN1", obj.aliases)
        self.assertEqual(obj.properties["opacityClass"], 3)
        self.assertTrue(obj.shape.approximate)
        self.assertAlmostEqual(obj.coordinates.ra_deg, 247.2144, places=4)
        self.assertEqual(obj.sources[0].original_frame, "FK4/B1950")

    def test_barnard_parses_suffix_capable_aliases_diameter_and_multiline_notes(self):
        obj = barnard.load(
            FIXTURES / "barnard.tsv",
            strict=False,
            notes_path=FIXTURES / "barnard-notes.tsv",
        )[0]
        self.assertIn("B1", obj.aliases)
        self.assertEqual(obj.shape.major_arcmin, 30)
        self.assertIn("Elongated component", obj.properties["notes"])
        self.assertAlmostEqual(obj.coordinates.ra_deg, 53.2392, places=4)

    def test_lbn_keeps_uncertain_type_and_treats_zero_classes_as_unknown(self):
        objects = lbn.load(FIXTURES / "lbn.tsv", strict=False)
        self.assertEqual(objects[0].type_code, "Neb")
        self.assertIn("Sh2-17", objects[0].cross_identifications)
        self.assertEqual(objects[0].shape.major_arcmin, 4)
        self.assertNotIn("colorClass", objects[1].properties)
        self.assertNotIn("brightnessClass", objects[1].properties)
        self.assertIn("NGC 6960", objects[1].cross_identifications)

    def test_sharpless_uses_b1900_and_marks_irregular_max_diameter_approximate(self):
        obj = sharpless.load(FIXTURES / "sharpless.tsv", strict=False)[0]
        self.assertEqual(obj.type_code, "HII")
        self.assertTrue(obj.shape.approximate)
        self.assertAlmostEqual(obj.coordinates.ra_deg, 239.713366, places=4)

    def test_vdb_uses_original_galactic_position_and_retains_simbad_supplement(self):
        obj = vdb.load(FIXTURES / "vdb.tsv", strict=False)[0]
        self.assertEqual(obj.type_code, "RfN")
        self.assertAlmostEqual(obj.coordinates.ra_deg, 2.753937982, places=7)
        self.assertAlmostEqual(obj.properties["vizierSimbadRaDeg"], 2.69319, places=4)
        self.assertEqual(obj.properties["illuminatingStarVMagnitude"], 8.6)
        self.assertNotIn("magnitude", obj.properties)
        self.assertTrue(obj.shape.approximate)

    def test_rcw_expands_cross_ids_and_aggregates_notes_without_calling_it_hii(self):
        obj = rcw.load(
            FIXTURES / "rcw.tsv", strict=False, notes_path=FIXTURES / "rcw-notes.tsv"
        )[0]
        self.assertEqual(obj.type_code, "EmN")
        self.assertIn("NGC 2327", obj.cross_identifications)
        self.assertIn("HS 114", obj.cross_identifications)
        self.assertIn("Fainter surrounding", obj.properties["notes"])

    def test_dcld_duplicate_designations_get_distinct_uids_and_never_fake_pa(self):
        objects = dcld.load(FIXTURES / "dcld.tsv", strict=False)
        self.assertEqual(len(objects), 2)
        self.assertNotEqual(objects[0].uid, objects[1].uid)
        self.assertEqual(objects[0].uid, "dcld:255.9-02.6:1")
        self.assertTrue(objects[1].properties["complex"])
        self.assertIsNone(objects[1].shape.position_angle_deg)

    def test_feitzinger_area_is_approximate_and_galactic_inclination_is_property(self):
        obj = feitzinger.load(FIXTURES / "feitzinger-darkneb.tsv", strict=False)[0]
        self.assertEqual(obj.primary_name, "FeSt 1-1")
        self.assertTrue(obj.shape.approximate)
        self.assertEqual(obj.properties["galacticInclinationDeg"], -50)
        self.assertIsNone(obj.shape.position_angle_deg)

    def test_missing_columns_and_malformed_rows_include_source_context(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.tsv"
            path.write_text("LDN\tRA1950\n1\tbad\n", encoding="utf-8")
            with self.assertRaisesRegex(SourceRowError, "missing required columns"):
                read_vizier_tsv(path, ldn.SPEC.required_columns)

    def test_source_manifest_has_pinned_gates_and_complete_review_metadata(self):
        manifest = json.loads((TOOLS / "catalog_sources" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(set(manifest["catalogues"]), {"ldn", "barnard", "lbn", "sharpless", "vdb", "rcw", "dcld", "feitzinger"})
        for source in manifest["catalogues"].values():
            self.assertEqual(source["rightsStatus"], "review-required")
            self.assertIsNone(source["license"])
            self.assertIn("No catalogue-specific redistribution licence", source["licenseStatement"])
            self.assertEqual(source["termsUrl"], manifest["rightsNoticeUrl"])
            self.assertTrue(source["authors"])
            self.assertTrue(source["bibcode"])
            self.assertTrue(source["publicationUrl"].startswith("https://"))
            self.assertTrue(source["readMeUrl"].startswith("https://"))
            self.assertTrue(source["sourceTables"])
            self.assertIn(source["bibcode"], source["requiredAcknowledgement"])
            self.assertIn("Astropy", source["modifications"])
            self.assertRegex(source["canonicalSha256"], r"^[0-9a-f]{64}$")
            self.assertGreater(source["expectedRows"], 100)

    def test_generated_openngc_manifest_has_complete_attribution_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "NGC.csv").write_text("Name;Type\n", encoding="utf-8")
            overrides = root / "overrides.json"
            overrides.write_text("{}\n", encoding="utf-8")
            manifest = _selected_manifest(
                ("openngc",),
                openngc_dir=root,
                openngc_version="test",
                vizier_dir=None,
                overrides_path=overrides,
            )
        source = manifest["catalogues"]["openngc"]
        self.assertIsNone(source["vizierId"])
        self.assertEqual(source["license"], "CC-BY-SA-4.0")
        self.assertTrue(source["authors"])
        self.assertTrue(source["requiredAcknowledgement"])
        self.assertTrue(source["modifications"])
        self.assertEqual(source["excludedTypes"], ["*", "**", "Dup", "NonEx", "Nova"])
        self.assertEqual(
            source["sourceUrls"],
            ["https://raw.githubusercontent.com/mattiaverga/OpenNGC/test/database_files/NGC.csv"],
        )


if __name__ == "__main__":
    unittest.main()
