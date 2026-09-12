import importlib.util
import hashlib
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


HYG = load_module("build_hyg_star_catalog", "tools/build_hyg_star_catalog.py")
SAO = load_module("build_sao_star_crossids", "tools/build_sao_star_crossids.py")
WR = load_module("build_wr_star_catalog", "tools/build_wr_star_catalog.py")


class StarIdentifierCatalogTests(unittest.TestCase):
    def test_hyg_retains_hd_as_a_search_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "hyg.csv"
            path.write_text(
                "id,hip,hd,proper,ra,dec,mag,ci,con\n"
                "1,32349,48915,Sirius,6.7525,-16.7161,-1.46,0.00,CMa\n"
                "2,,99999,,7.0,10.0,7.2,0.5,Gem\n",
                encoding="utf-8",
            )
            stars, source_rows = HYG.load_hyg_candidates(
                path,
                expected_source_rows=None,
                expected_eligible_rows=None,
            )

            self.assertEqual(source_rows, 2)
            self.assertEqual(len(stars), 1)
            self.assertEqual(stars[0]["hd"], 48915)
            self.assertEqual(stars[0]["aliases"], ["HD 48915"])

            cross_ids = HYG.curated_star_cross_ids(
                [stars[0]], [{"name": "Sirius", "ra": 6.7525, "dec": -16.7161}]
            )
            self.assertEqual(cross_ids[0]["curatedName"], "Sirius")
            self.assertIn("HIP 32349", cross_ids[0]["aliases"])
            self.assertIn("HD 48915", cross_ids[0]["aliases"])
            self.assertEqual(cross_ids[0]["hds"], [48915])

    def test_sao_cross_index_preserves_pairs_and_marks_identity_conflicts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sao.tsv"
            path.write_text(
                "oid\thd_id\tsao_id\n"
                "10\tHD 48915\tSAO 151881\n"
                "11\tHD 123\tSAO 1\n"
                "11\tHD 123\tSAO 2\n"
                "12\tHD 124\tSAO 3\n"
                "13\tHD 125\tSAO 3\n",
                encoding="utf-8",
            )
            records, stats = SAO.load_cross_ids(path)

            self.assertEqual(records[0], {"hd": 123, "saos": [1, 2], "ambiguous": False})
            self.assertEqual(records[-1], {"hd": 48915, "saos": [151881], "ambiguous": False})
            self.assertEqual(stats["sourceRowCount"], 5)
            self.assertEqual(stats["ambiguousHdKeyCount"], 2)

    def test_sao_browser_asset_stays_separately_licensed(self):
        meta = SAO.metadata(
            source_sha256="0" * 64,
            stats={
                "sourceRowCount": 1,
                "hdKeyCount": 1,
                "objectCount": 1,
                "ambiguousHdKeyCount": 0,
            },
            source_date_epoch=0,
        )
        script = SAO.browser_script(meta, [{"hd": 48915, "saos": [151881], "ambiguous": False}])
        self.assertIn("SPDX-License-Identifier: ODbL-1.0", script)
        self.assertIn("SAO_STAR_CROSSIDS", script)
        self.assertNotIn("HYG_STAR_DATA", script)

    def test_sao_component_suffix_is_not_the_numeric_hd_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sao.tsv"
            path.write_text("oid\thd_id\tsao_id\n1\tHD 123\tSAO 1\n2\tHD 123A\tSAO 2\n", encoding="utf-8")
            records, _ = SAO.load_cross_ids(path)
            self.assertIn({"hd": 123, "saos": [1], "ambiguous": False}, records)
            self.assertIn({"hdDesignation": "HD 123A", "saos": [2], "ambiguous": False}, records)

    def test_wr_measured_magnitudes_are_retained_and_unknown_values_stay_search_only(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wr.tsv"
            path.write_text(
                "oid\twr_id\tmain_id\tra\tdec\totype\tvmag\tidentifier\n"
                "42\tWR 104\tWR 104\t270\t-23\tWR*\t13.155\tWR 104\n"
                "43\tWR 105\tWR 105\t271\t-23\tWR*\t\tWR 105\n", encoding="utf-8")
            records = WR.compact_records(WR.load_snapshot(path)[0])
            self.assertEqual(records[0]["mag"], 13.155)
            self.assertFalse(records[0]["searchOnly"])
            self.assertNotIn("mag", records[1])
            self.assertTrue(records[1]["searchOnly"])

    def test_wr_snapshot_groups_aliases_into_one_search_star(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wr.tsv"
            path.write_text(
                "oid\twr_id\tmain_id\tra\tdec\totype\tidentifier\n"
                "42\tWR 104\tWR 104\t273.0\t-23.0\tWR*\tWR 104\n"
                "42\tWR 104\tWR 104\t273.0\t-23.0\tWR*\tHD 164270\n",
                encoding="utf-8",
            )
            objects, source_rows = WR.load_snapshot(path)
            records = WR.compact_records(objects)

            self.assertEqual(source_rows, 2)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["id"], "WR 104")
            self.assertIn("HD 164270", records[0]["aliases"])
            self.assertEqual(records[0]["raDeg"], 273.0)
            self.assertEqual(records[0]["decDeg"], -23.0)
            self.assertTrue(records[0]["searchOnly"])
            self.assertNotIn("mag", records[0])

    def test_curated_transfer_never_uses_position_or_array_index(self):
        star = {"uid": "hyg:1", "hyg": 1, "id": "HIP 1", "name": "One", "ra": 1, "dec": 2}
        other = {"name": "Unrelated", "ra": 1, "dec": 2}
        curated = {"name": "One", "ra": 1, "dec": 2}
        self.assertEqual(HYG.curated_star_cross_ids([star], [other]), [])
        expected = HYG.curated_star_cross_ids([star], [curated, other])
        self.assertEqual(expected, HYG.curated_star_cross_ids([star], [other, curated]))
        self.assertEqual(HYG.curated_star_cross_ids([star, {**star, "hyg": 2}], [curated]), [])

    def test_builders_are_deterministic_and_validate_inputs(self):
        fixtures = [
            (SAO, "oid\thd_id\tsao_id\n", ["1\tHD 1\tSAO 2\n", "1\tHD 1\tSAO 3\n"], "sao-star-crossids.json"),
            (WR, "oid\twr_id\tmain_id\tra\tdec\totype\tidentifier\n",
             ["42\tWR 104\tWR 104\t273\t-23\tWR*\tWR 104\n",
              "42\tWR 104\tWR 104\t273\t-23\tWR*\tHD 164270\n"], "wr-star-catalog.json"),
        ]
        for module, header, rows, output in fixtures:
            with self.subTest(module=module.__name__), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / "fixture.tsv"
                source.write_text(header + "".join(rows), encoding="utf-8")
                digest = hashlib.sha256(source.read_bytes()).hexdigest()
                args = ["--source-file", str(source), "--output-dir", str(root / "out"),
                        "--expected-sha256", digest, "--source-date-epoch", "0"]
                self.assertEqual(module.main(args), 0)
                first = (root / "out" / "data" / output).read_bytes()
                self.assertEqual(module.main(args), 0)
                self.assertEqual(first, (root / "out" / "data" / output).read_bytes())
                loader = module.load_cross_ids if module is SAO else module.load_snapshot
                before = loader(source)
                source.write_text(header + "".join(reversed(rows)), encoding="utf-8")
                after = loader(source)
                self.assertEqual(before, after)
                with self.assertRaisesRegex(RuntimeError, "expected sha256"):
                    module.main(args)
                source.write_text(header, encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "empty"):
                    loader(source)

    def test_wr_rejects_invalid_coordinates_and_colliding_designations(self):
        header = "oid\twr_id\tmain_id\tra\tdec\totype\tidentifier\n"
        row = "42\tWR 104\tWR 104\t273\t-23\tWR*\tWR 104\n"
        for content in [row.replace("273", "nan"), row.replace("273", "360"),
                        row.replace("-23", "91"), row + row.replace("42", "43")]:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "wr.tsv"
                path.write_text(header + content, encoding="utf-8")
                with self.assertRaises(ValueError):
                    WR.load_snapshot(path)


if __name__ == "__main__":
    unittest.main()
