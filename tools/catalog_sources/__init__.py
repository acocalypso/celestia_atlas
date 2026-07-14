"""Catalogue source registry.  Importers never access the network."""

from __future__ import annotations

from catalog_sources import barnard, dcld, feitzinger, lbn, ldn, rcw, sharpless, vdb


SOURCE_MODULES = {
    module.SPEC.key: module
    for module in (ldn, barnard, lbn, sharpless, vdb, rcw, dcld, feitzinger)
}
SOURCE_SPECS = {key: module.SPEC for key, module in SOURCE_MODULES.items()}

__all__ = ["SOURCE_MODULES", "SOURCE_SPECS"]
