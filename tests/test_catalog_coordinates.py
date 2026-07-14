from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest


TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))

from catalog_coordinates import (  # noqa: E402
    area_to_equivalent_diameter_arcmin,
    fk4_to_icrs,
    galactic_to_icrs,
    shape_from_area,
    shape_from_axes,
)
from catalog_model import CatalogValidationError  # noqa: E402


class CoordinateTests(unittest.TestCase):
    def assert_coordinate(self, coordinate, ra_deg: float, dec_deg: float, places: int = 4):
        self.assertAlmostEqual(coordinate.ra_deg, ra_deg, places=places)
        self.assertAlmostEqual(coordinate.dec_deg, dec_deg, places=places)

    def test_fk4_b1950_matches_vizier_ldn_fixture(self):
        value = fk4_to_icrs("16 26.0", "-16 00", equinox="B1950")
        self.assert_coordinate(value, 247.2144, -16.1094)
        self.assertEqual(value.original_frame, "FK4/B1950")

    def test_fk4_b1875_matches_vizier_barnard_fixture(self):
        value = fk4_to_icrs("03 25 14", "+30 44", equinox="B1875")
        self.assert_coordinate(value, 53.2392, 31.1592)

    def test_fk4_b1900_matches_vizier_sharpless_fixture(self):
        value = fk4_to_icrs("15 52 48.0", "-25 50 00", equinox="B1900")
        self.assert_coordinate(value, 239.713366, -26.120520, places=4)

    def test_galactic_to_icrs_uses_iau_galactic_frame(self):
        value = galactic_to_icrs(117.7, -3.7)
        self.assert_coordinate(value, 2.753937982, 58.760520882, places=7)
        self.assertEqual(value.original_frame, "Galactic/IAU1958")

    def test_area_is_equivalent_circle_and_marked_approximate(self):
        self.assertAlmostEqual(area_to_equivalent_diameter_arcmin(math.pi / 4), 60)
        shape = shape_from_area(math.pi / 4)
        self.assertEqual(shape.major_arcmin, 60)
        self.assertTrue(shape.approximate)
        self.assertEqual(shape.derivation, "area_equivalent")

    def test_malformed_coordinate_and_area_fail_usefully(self):
        with self.assertRaisesRegex(CatalogValidationError, "Invalid FK4"):
            fk4_to_icrs("not-ra", "-16 00", equinox="B1950")
        with self.assertRaisesRegex(CatalogValidationError, "Area must be"):
            area_to_equivalent_diameter_arcmin(0)

    def test_major_only_axis_stays_unknown_instead_of_becoming_a_circle(self):
        shape = shape_from_axes(12, None, position_angle_deg=45)
        self.assertEqual(shape.kind, "ellipse")
        self.assertEqual(shape.major_arcmin, 12)
        self.assertIsNone(shape.minor_arcmin)
        self.assertIsNone(shape.position_angle_deg)

    def test_swapped_axes_rotate_the_position_angle_with_the_major_axis(self):
        shape = shape_from_axes(4, 10, position_angle_deg=20)
        self.assertEqual((shape.major_arcmin, shape.minor_arcmin), (10, 4))
        self.assertEqual(shape.position_angle_deg, 110)


if __name__ == "__main__":
    unittest.main()
