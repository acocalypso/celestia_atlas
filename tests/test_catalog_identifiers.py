from __future__ import annotations

from pathlib import Path
import sys
import unittest


TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))

from catalog_identifiers import (  # noqa: E402
    catalogue_aliases,
    dedupe_aliases,
    expand_prefixed_identifiers,
    identifier_key,
    search_key,
)


class IdentifierTests(unittest.TestCase):
    def assert_search_equivalent(self, *values: str):
        self.assertEqual(len({search_key(value) for value in values}), 1)

    def test_ldn_variants_are_search_equivalent_and_preserved_for_display(self):
        self.assert_search_equivalent("LDN 123", "LDN123", "Lynds Dark Nebula 123")
        aliases = dedupe_aliases("LDN 123", catalogue_aliases("ldn", "123"))
        self.assertIn("LDN123", aliases)
        self.assertIn("Lynds Dark Nebula 123", aliases)

    def test_barnard_variants_and_suffix(self):
        self.assert_search_equivalent("Barnard 72", "B 72", "B72", "Barnard72")
        self.assertEqual(identifier_key("B117a"), "barnard:117a")

    def test_sharpless_lbn_vdb_and_rcw_variants(self):
        self.assert_search_equivalent("Sh2-101", "Sh 2-101", "Sharpless 101")
        self.assert_search_equivalent("LBN 331", "LBN331", "Lynds Bright Nebula 331")
        self.assert_search_equivalent("vdB 142", "VdB142", "van den Bergh 142")
        self.assert_search_equivalent("RCW 104", "RCW104")

    def test_coordinate_designation_sign_is_not_lost(self):
        negative = identifier_key("DCld 000.0-18.9")
        positive = identifier_key("DCld 000.0+18.9")
        self.assertNotEqual(negative, positive)
        self.assertEqual(negative, "dcld:000.0-18.9")

    def test_fest_tables_have_distinct_namespaces(self):
        self.assertEqual(identifier_key("FeSt 1-457"), "fest1:457")
        self.assertEqual(identifier_key("FeSt 2-457"), "fest2:457")

    def test_prefixed_cross_identifications_expand_deterministically(self):
        self.assertEqual(
            expand_prefixed_identifiers("NGC2327; HS111,113,114;G2,3"),
            ("NGC 2327", "HS 111", "HS 113", "HS 114", "G2", "G3"),
        )

    def test_abbreviated_and_mixed_rcw_cross_identifications(self):
        self.assertEqual(
            expand_prefixed_identifiers("NGC6164,5; G52"),
            ("NGC 6164", "NGC 6165", "G52"),
        )
        self.assertEqual(
            expand_prefixed_identifiers("IC2944,8; G38,a,b"),
            ("IC 2944", "IC 2948", "G38", "G38a", "G38b"),
        )
        self.assertEqual(
            expand_prefixed_identifiers("NGC3293,3324,IC2599"),
            ("NGC 3293", "NGC 3324", "IC 2599"),
        )
        self.assertEqual(
            expand_prefixed_identifiers("NGC6523(M8), 6559"),
            ("NGC 6523", "M 8", "NGC 6559"),
        )


if __name__ == "__main__":
    unittest.main()
