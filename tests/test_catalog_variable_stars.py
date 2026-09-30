"""Source parsing and checked-in GCVS catalogue consistency."""

import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_gcvs", ROOT / "tools" / "build_gcvs_variable_stars.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class VariableStarCatalogueTests(unittest.TestCase):
    def test_coordinate_and_designation_parsing(self):
        self.assertEqual(builder.parse_coordinates(" 235959.9 -900000.0"), (359.9995833, -90.0))
        self.assertIsNone(builder.parse_coordinates(" 240000.0 +000000.0"))
        self.assertEqual(builder.parse_name("V0663 Car *"), ("V663 Car", ["V0663 Car"]))

    def test_checked_in_catalogue_matches_pinned_source(self):
        data = json.loads((ROOT / "data" / "gcvs-variable-stars.json").read_text(encoding="utf-8"))
        self.assertEqual(data["meta"]["sourceSha256"], builder.SOURCE_SHA256)
        self.assertEqual(data["meta"]["searchableStars"], 63291)
        self.assertEqual(data["meta"]["excludedWithoutCoordinates"], 182)
        self.assertEqual(len(data["rows"]), 63291)


if __name__ == "__main__":
    unittest.main()
