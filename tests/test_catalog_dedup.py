from __future__ import annotations

from pathlib import Path
import sys
import unittest


TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))

from catalog_dedup import deduplicate_catalog  # noqa: E402
from catalog_model import CatalogObject, CatalogSourceRef, Coordinates, Shape  # noqa: E402


def object_(
    uid: str,
    name: str,
    catalogue: str,
    identifier: str,
    *,
    group: str,
    type_code: str = "DrkN",
    ra: float = 10,
    dec: float = 20,
    aliases: tuple[str, ...] = (),
    crosses: tuple[str, ...] = (),
    size: float | None = 10,
    accuracy: float = 10,
) -> CatalogObject:
    return CatalogObject(
        uid=uid,
        primary_name=name,
        aliases=aliases,
        type_code=type_code,
        coordinates=Coordinates(ra, dec, accuracy_arcsec=accuracy),
        shape=Shape("circle", size, size, approximate=False, derivation="catalog_diameter") if size else Shape(),
        sources=(CatalogSourceRef(catalogue, identifier),),
        catalogue_groups=(group,),
        cross_identifications=crosses,
    )


class DedupTests(unittest.TestCase):
    def test_unambiguous_explicit_cross_identification_merges_and_preserves_sources(self):
        ldn = object_("ldn:1", "LDN 1", "LDN", "1", group="ldn", crosses=("Barnard 1",))
        barnard = object_("barnard:1", "Barnard 1", "Barnard", "1", group="barnard")
        result = deduplicate_catalog([ldn, barnard], include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 1)
        self.assertEqual({source.catalogue for source in result.objects[0].sources}, {"LDN", "Barnard"})

    def test_one_to_many_ldn_barnard_cross_ids_never_merge_in_exact_alias_pass(self):
        ldn = object_(
            "ldn:10",
            "LDN 10",
            "LDN",
            "10",
            group="ldn",
            aliases=("Barnard 1", "Barnard 2"),
            crosses=("Barnard 1", "Barnard 2"),
        )
        first = object_("barnard:1", "Barnard 1", "Barnard", "1", group="barnard")
        second = object_("barnard:2", "Barnard 2", "Barnard", "2", group="barnard")
        result = deduplicate_catalog([ldn, first, second], include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 3)
        self.assertGreaterEqual(len(result.ambiguous_cross_identifications), 2)
        ldn_out = next(obj for obj in result.objects if obj.uid == "ldn:10")
        self.assertEqual({ref.catalogue for ref in ldn_out.related_source_refs}, {"Barnard"})

    def test_same_catalog_duplicate_designations_are_not_exact_alias_merged(self):
        first = object_("dcld:x:1", "DCld 1.0-2.0", "DCld", "1.0-2.0", group="dcld")
        second = object_("dcld:x:2", "DCld 1.0-2.0", "DCld", "1.0-2.0", group="dcld", ra=11)
        result = deduplicate_catalog([first, second], include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 2)

    def test_incompatible_types_do_not_merge_even_with_explicit_id(self):
        dark = object_("dark", "LDN 1", "LDN", "1", group="ldn", crosses=("Sh2-1",))
        emission = object_("bright", "Sh2-1", "Sh2", "1", group="sharpless", type_code="HII")
        result = deduplicate_catalog([dark, emission], include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 2)

    def test_implausibly_distant_explicit_xref_is_review_only(self):
        ldn = object_(
            "ldn:39",
            "LDN 39",
            "LDN",
            "39",
            group="ldn",
            crosses=("Barnard 317",),
            ra=10,
        )
        barnard = object_(
            "barnard:317",
            "Barnard 317",
            "Barnard",
            "317",
            group="barnard",
            ra=35,
        )
        result = deduplicate_catalog([ldn, barnard], include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 2)
        self.assertEqual(
            result.ambiguous_cross_identifications,
            (("barnard:317", ("barnard:317", "ldn:39")),),
        )

    def test_overlapping_large_objects_can_use_explicit_xref_beyond_two_degrees(self):
        lbn = object_(
            "lbn:1",
            "LBN 1",
            "LBN",
            "1",
            group="lbn",
            type_code="Neb",
            crosses=("Sh2-1",),
            size=360,
            ra=10,
            dec=0,
        )
        sharpless = object_(
            "sh2:1",
            "Sh2-1",
            "Sh2",
            "1",
            group="sharpless",
            type_code="HII",
            size=120,
            ra=13,
            dec=0,
        )
        result = deduplicate_catalog([lbn, sharpless], include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 1)

    def test_position_is_candidate_only_never_an_automatic_merge(self):
        first = object_("lbn:1", "LBN 1", "LBN", "1", group="lbn", type_code="Neb")
        second = object_(
            "sh2:1",
            "Sh2-1",
            "Sh2",
            "1",
            group="sharpless",
            type_code="HII",
            ra=10.01,
        )
        result = deduplicate_catalog([first, second], include_spatial_candidates=True)
        self.assertEqual(len(result.objects), 2)
        self.assertEqual(len(result.candidates), 1)

    def test_manual_override_can_merge_reviewed_ambiguous_identity(self):
        first = object_("ldn:1", "LDN 1", "LDN", "1", group="ldn")
        second = object_("barnard:1", "Barnard 1", "Barnard", "1", group="barnard")
        overrides = {"merge": [{"canonical": "barnard:1", "members": ["ldn:1", "barnard:1"]}], "doNotMerge": []}
        result = deduplicate_catalog([first, second], overrides=overrides, include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 1)
        self.assertEqual(result.objects[0].uid, "barnard:1")

    def test_merged_object_keeps_precise_openngc_coordinate_over_historical_centre(self):
        openngc = object_(
            "openngc:ngc1",
            "NGC 1",
            "OpenNGC",
            "NGC 1",
            group="openngc",
            type_code="Neb",
            ra=10.5,
            accuracy=1,
        )
        lbn = object_(
            "lbn:1",
            "LBN 1",
            "LBN",
            "1",
            group="lbn",
            type_code="Neb",
            ra=10,
            accuracy=900,
            crosses=("NGC 1",),
        )
        result = deduplicate_catalog([openngc, lbn], include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 1)
        self.assertEqual(result.objects[0].coordinates.ra_deg, 10.5)

    def test_do_not_merge_override_wins(self):
        ldn = object_("ldn:1", "LDN 1", "LDN", "1", group="ldn", crosses=("Barnard 1",))
        barnard = object_("barnard:1", "Barnard 1", "Barnard", "1", group="barnard")
        overrides = {"merge": [], "doNotMerge": [["ldn:1", "barnard:1"]]}
        result = deduplicate_catalog([ldn, barnard], overrides=overrides, include_spatial_candidates=False)
        self.assertEqual(len(result.objects), 2)

    def test_source_provenance_sort_handles_optional_metadata(self):
        first = object_("first", "First", "Shared", "1", group="first")
        second = object_("second", "Second", "Shared", "1", group="second").with_updates(
            sources=(CatalogSourceRef("Shared", "1", "VII/test", "catalog"),)
        )
        result = deduplicate_catalog(
            [first, second],
            overrides={"merge": [{"members": ["first", "second"]}], "doNotMerge": []},
            include_spatial_candidates=False,
        )
        self.assertEqual(len(result.objects), 1)
        self.assertEqual(len(result.objects[0].sources), 2)


if __name__ == "__main__":
    unittest.main()
