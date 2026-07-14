from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
FIXTURE = Path(__file__).with_name("fixtures") / "catalog_sources" / "stellarium-catalog.txt"
sys.path.insert(0, str(TOOLS))

from catalog_sources import stellarium  # noqa: E402
from catalog_sources.base import SourceRowError  # noqa: E402


class StellariumSourceImporterTests(unittest.TestCase):
    def test_release_constants_are_pinned(self):
        self.assertEqual(stellarium.SOURCE_VERSION, "v26.2")
        self.assertEqual(stellarium.CATALOG_VERSION, "3.23")
        self.assertEqual(stellarium.EXPECTED_ROWS, 94_899)
        self.assertEqual(
            stellarium.SOURCE_SHA256,
            "38a7c8c19b07bb3b2a659769acf4e5611a261732727d8e541c52ce691ab607aa",
        )

    def test_type_mapping_tracks_stellarium_runtime_categories(self):
        self.assertEqual(stellarium._TYPE_MAP["GIG"], "G")
        self.assertEqual(stellarium._TYPE_MAP["GNE"], "HII")
        self.assertEqual(stellarium._TYPE_MAP["IR"], "DrkN")
        self.assertEqual(stellarium._TYPE_MAP["CGB"], "Neb")

    def test_filters_rows_and_preserves_designations_shape_type_and_photometry(self):
        objects = stellarium.load(FIXTURE, strict=False)
        self.assertEqual(len(objects), 6)

        dark = objects[0]
        self.assertEqual(dark.uid, "stellarium:90001")
        self.assertEqual(dark.primary_name, "Barnard 72")
        self.assertEqual(dark.type_code, "DrkN")
        self.assertEqual(dark.coordinates.original_frame, "FK5/J2000")
        self.assertEqual(dark.coordinates.original_values, {"raDeg": 10.0, "decDeg": -20.0})
        self.assertEqual(dark.shape.major_arcmin, 30)
        self.assertEqual(dark.shape.minor_arcmin, 15)
        self.assertEqual(dark.shape.position_angle_deg, 45)
        self.assertEqual(dark.shape.derivation, "stellarium_catalog_axes")
        self.assertEqual(dark.properties["opacityClass"], 4)
        self.assertNotIn("magnitude", dark.properties)
        self.assertNotIn("magnitudeBand", dark.properties)
        self.assertNotIn("bMagnitude", dark.properties)
        self.assertNotIn("vMagnitude", dark.properties)
        self.assertIn("B72", dark.aliases)
        self.assertIn("LDN 1235", dark.aliases)
        self.assertIn("NGC 7000", dark.aliases)
        self.assertIn("Ced 12", dark.aliases)
        self.assertIn("ESO 123-45", dark.aliases)
        self.assertEqual(
            dark.cross_identifications,
            ("NGC 7000", "Barnard 72", "LDN 1235", "Ced 12", "ESO 123-45"),
        )
        self.assertEqual(
            [source.catalogue for source in dark.sources],
            ["Barnard via Stellarium", "LDN via Stellarium"],
        )
        self.assertEqual(dark.catalogue_groups, ("barnard", "ldn"))

        emission = objects[1]
        self.assertEqual(emission.primary_name, "Sh2-101")
        self.assertEqual(emission.type_code, "HII")
        self.assertEqual(emission.shape.major_arcmin, 12)
        self.assertIsNone(emission.shape.minor_arcmin)
        self.assertIsNone(emission.shape.position_angle_deg)
        self.assertIn("vdB 142", emission.cross_identifications)
        self.assertIn("RCW 104", emission.cross_identifications)
        self.assertIn("LBN 331", emission.cross_identifications)
        self.assertIn("PN G243.3-01.0", emission.aliases)
        self.assertEqual(
            [source.catalogue for source in emission.sources],
            [
                "Sharpless 2 via Stellarium",
                "vdB via Stellarium",
                "RCW via Stellarium",
                "LBN via Stellarium",
            ],
        )
        self.assertEqual(
            emission.catalogue_groups,
            ("sharpless", "vdb", "rcw", "lbn"),
        )
        self.assertEqual(emission.properties["magnitude"], 8.4)
        self.assertEqual(emission.properties["magnitudeBand"], "V")

        interacting = objects[2]
        self.assertEqual(interacting.primary_name, "Sh2-191")
        self.assertEqual(interacting.type_code, "G")
        self.assertEqual(interacting.properties["magnitude"], 3.4)

        zero_photometry = objects[3]
        self.assertEqual(zero_photometry.primary_name, "vdB 84")
        self.assertEqual(zero_photometry.type_code, "RfN")
        self.assertNotIn("bMagnitude", zero_photometry.properties)
        self.assertNotIn("vMagnitude", zero_photometry.properties)
        self.assertNotIn("magnitude", zero_photometry.properties)

        infrared_dark = objects[4]
        self.assertEqual(infrared_dark.primary_name, "LDN 528")
        self.assertEqual(infrared_dark.type_code, "DrkN")
        self.assertEqual(infrared_dark.properties["opacityClass"], 3)
        self.assertNotIn("magnitude", infrared_dark.properties)

        associated_ldn = objects[5]
        self.assertEqual(associated_ldn.primary_name, "LDN 1036")
        self.assertEqual(associated_ldn.type_code, "Other")
        self.assertEqual(associated_ldn.properties["opacityClass"], 5)
        self.assertNotIn("magnitude", associated_ldn.properties)

    def test_strict_mode_applies_the_release_row_gate(self):
        with self.assertRaisesRegex(SourceRowError, "expected 94,899 rows, found 6"):
            stellarium.load(FIXTURE)

    def test_malformed_rows_report_file_and_line(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.txt"
            path.write_text("# Version 3.23 standard\n1\t2\t3\n", encoding="utf-8")
            with self.assertRaisesRegex(SourceRowError, r"catalog\.txt:2: expected 45"):
                stellarium.load(path, strict=False)


if __name__ == "__main__":
    unittest.main()
