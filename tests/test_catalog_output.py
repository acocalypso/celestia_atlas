from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest


TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))

from catalog_model import CatalogObject, CatalogSourceRef, Coordinates, Shape  # noqa: E402
from catalog_output import compact_object, write_outputs  # noqa: E402
from fetch_catalog_sources import canonicalize_vizier_tsv  # noqa: E402


def sample_object() -> CatalogObject:
    return CatalogObject(
        uid="ldn:1",
        primary_name="LDN 1",
        aliases=("LDN1", "Lynds Dark Nebula 1"),
        type_code="DrkN",
        coordinates=Coordinates(247.214414806, -16.109431339, original_frame="FK4/B1950"),
        shape=Shape("circle", 15.7, 15.7, approximate=True, derivation="area_equivalent"),
        properties={
            "opacityClass": 3,
            "brightnessClass": 2,
            "brightnessScale": "1 faintest; 3 brightest",
            "densityClass": "A",
            "densityScale": "A most dense; C least dense",
            "areaSquareDeg": 0.054,
        },
        sources=(CatalogSourceRef("LDN", "1", "VII/7A", "ldn", "1", "FK4/B1950"),),
        catalogue_groups=("ldn",),
    )


class OutputTests(unittest.TestCase):
    def test_compact_schema_has_degree_coordinates_shape_properties_and_sources(self):
        value = compact_object(sample_object())
        self.assertEqual(value["id"], "LDN 1")
        self.assertEqual(value["raDeg"], 247.214414806)
        self.assertNotIn("ra", value)
        self.assertTrue(value["shape"]["approximate"])
        self.assertEqual(value["properties"]["opacityClass"], 3)
        self.assertEqual(value["properties"]["brightnessScale"], "1 faintest; 3 brightest")
        self.assertEqual(value["properties"]["densityScale"], "A most dense; C least dense")
        self.assertEqual(value["sources"][0]["vizierId"], "VII/7A")
        self.assertEqual(value["catalogueGroups"], ["ldn"])

    def test_outputs_are_byte_deterministic_and_epoch_controlled(self):
        manifest = {"schemaVersion": 1, "catalogues": {"ldn": {"rightsStatus": "review-required"}}}
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first = write_outputs(Path(first_dir), [sample_object()], source_manifest=manifest, source_date_epoch=0)
            second = write_outputs(Path(second_dir), [sample_object()], source_manifest=manifest, source_date_epoch=0)
            for name in first:
                self.assertEqual(first[name].read_bytes(), second[name].read_bytes(), name)
            payload = json.loads(first["dso-catalog.json"].read_text(encoding="utf-8"))
            self.assertEqual(payload["meta"]["generatedAt"], "1970-01-01T00:00:00+00:00")
            self.assertEqual(payload["meta"]["version"], "ldn")
            browser_bundle = first["dso-catalog.js"].read_text(encoding="utf-8")
            self.assertIn("window.DSO_CATALOG_DATA=", browser_bundle)
            self.assertIn("curatedByKey", browser_bundle)

    def test_openngc_compact_records_retain_flat_axes_for_existing_renderers(self):
        obj = sample_object().with_updates(
            uid="openngc:ngc1",
            primary_name="NGC 1",
            sources=(CatalogSourceRef("OpenNGC", "NGC 1", table="NGC.csv"),),
            catalogue_groups=("openngc",),
        )
        value = compact_object(obj)
        self.assertEqual(value["major"], 15.7)
        self.assertEqual(value["minor"], 15.7)
        self.assertNotIn("shape", value)

    def test_compact_output_keeps_source_qualified_property_conflicts(self):
        obj = sample_object().with_updates(
            properties={
                **sample_object().properties,
                "sourcePropertyConflicts": {
                    "lbn:13": {
                        "brightnessClass": 6,
                        "brightnessScale": "1 brightest; 6 barely detectable",
                    }
                },
            }
        )
        value = compact_object(obj)
        self.assertEqual(
            value["properties"]["sourcePropertyConflicts"]["lbn:13"]["brightnessClass"],
            6,
        )

    def test_legacy_mode_writes_all_three_package_paths(self):
        obj = sample_object().with_updates(
            uid="openngc:ngc1",
            primary_name="NGC 1",
            sources=(CatalogSourceRef("OpenNGC", "NGC 1", table="NGC.csv"),),
            catalogue_groups=("openngc",),
            properties={"catalogId": "NGC 1", "magnitude": 12.3},
        )
        manifest = {
            "schemaVersion": 1,
            "catalogues": {
                "openngc": {
                    "version": "test",
                    "sourceUrls": ["https://example.test/NGC.csv"],
                    "excludedTypes": ["Dup"],
                }
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            paths = write_outputs(Path(directory), [obj], source_manifest=manifest, legacy_openngc_outputs=True)
            self.assertIn("openngc-catalog.json", paths)
            self.assertIn("openngc-viewer-catalog.json", paths)
            self.assertIn("openngc-meta.json", paths)
            legacy = json.loads(paths["openngc-catalog.json"].read_text(encoding="utf-8"))["objects"][0]
            self.assertEqual(legacy["catalogId"], "NGC 1")
            self.assertAlmostEqual(legacy["ra"] * 15, obj.coordinates.ra_deg)
            self.assertEqual(legacy["description"], "A dark nebula obscuring background starlight.")
            legacy_meta = json.loads(paths["openngc-meta.json"].read_text(encoding="utf-8"))
            self.assertEqual(legacy_meta["name"], "OpenNGC offline DSO catalogue")
            self.assertEqual(legacy_meta["sources"], ["https://example.test/NGC.csv"])
            self.assertEqual(legacy_meta["excludedTypes"], ["Dup"])
            neutral = json.loads(paths["dso-catalog.json"].read_text(encoding="utf-8"))
            self.assertEqual(neutral["meta"]["version"], "test")

    def test_vizier_canonicalization_removes_dynamic_metadata(self):
        raw_a = "# Date: now\n# request=a\nA\tB\n---\t---\n1\t2\n"
        raw_b = "# Date: later\n# request=b\nA\tB\n---\t---\n1\t2\n"
        self.assertEqual(canonicalize_vizier_tsv(raw_a), canonicalize_vizier_tsv(raw_b))

    def test_dedup_report_preserves_ambiguous_identities_for_review(self):
        manifest = {"schemaVersion": 1, "catalogues": {"ldn": {}}}
        with tempfile.TemporaryDirectory() as directory:
            paths = write_outputs(
                Path(directory),
                [sample_object()],
                source_manifest=manifest,
                ambiguous_cross_identifications=(("barnard72", ("ldn:1", "barnard:72")),),
            )
            report = json.loads(paths["dedup-candidates.json"].read_text(encoding="utf-8"))
            self.assertEqual(
                report["ambiguousCrossIdentifications"][0]["objectUids"],
                ["ldn:1", "barnard:72"],
            )

    def test_projected_combined_runtime_payload_stays_below_seven_megabytes(self):
        new_record_size = len(json.dumps(compact_object(sample_object()), separators=(",", ":")))
        openngc = sample_object().with_updates(
            uid="openngc:ngc1",
            primary_name="NGC 1",
            aliases=("IC 1",),
            sources=(CatalogSourceRef("OpenNGC", "NGC 1", table="NGC.csv"),),
            catalogue_groups=("openngc",),
            properties={"catalogId": "NGC 1", "magnitude": 12.3},
        )
        openngc_record_size = len(json.dumps(compact_object(openngc), separators=(",", ":")))
        projected = openngc_record_size * 12578 + new_record_size * 6000
        self.assertLess(projected, 7_000_000)


if __name__ == "__main__":
    unittest.main()
