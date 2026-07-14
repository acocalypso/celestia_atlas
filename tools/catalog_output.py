"""Deterministic rich and browser-compact catalogue serialization."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Iterable, Mapping

from catalog_model import CatalogObject, CatalogSourceRef, DedupCandidate


_LEGACY_GENERIC_DESCRIPTIONS = {
    "G": "A galaxy listed in the OpenNGC catalogue.",
    "GPair": "A physically associated or apparent pair of galaxies listed in OpenNGC.",
    "GTrpl": "A triplet of galaxies listed in OpenNGC.",
    "GGroup": "A group of galaxies listed in OpenNGC.",
    "OCl": "An open star cluster in the Milky Way.",
    "GCl": "A dense globular star cluster.",
    "Cl+N": "A star cluster associated with surrounding nebulosity.",
    "*Ass": "A loose stellar association.",
    "PN": "A planetary nebula produced by an evolved star.",
    "HII": "An ionized hydrogen region associated with star formation.",
    "DrkN": "A dark nebula obscuring background starlight.",
    "EmN": "An emission nebula glowing in ionized gas.",
    "Neb": "A nebula listed in the OpenNGC catalogue.",
    "RfN": "A reflection nebula illuminated by nearby stars.",
    "SNR": "A supernova remnant produced by an exploded star.",
    "Other": "A deep-sky object listed in the OpenNGC catalogue.",
}


def _without_empty(value: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: item
        for key, item in value.items()
        if item is not None and item != "" and item != [] and item != () and item != {}
    }


def source_ref_dict(source: CatalogSourceRef) -> dict[str, Any]:
    return _without_empty(
        {
            "catalogue": source.catalogue,
            "identifier": source.identifier,
            "vizierId": source.vizier_id,
            "table": source.table,
            "originalIdentifier": source.original_identifier,
            "originalFrame": source.original_frame,
        }
    )


def shape_dict(obj: CatalogObject) -> dict[str, Any]:
    shape = obj.shape
    return _without_empty(
        {
            "kind": shape.kind,
            "majorArcmin": shape.major_arcmin,
            "minorArcmin": shape.minor_arcmin,
            "positionAngleDeg": shape.position_angle_deg,
            "approximate": shape.approximate,
            "derivation": shape.derivation,
        }
    )


def rich_object(obj: CatalogObject) -> dict[str, Any]:
    coordinates = _without_empty(
        {
            "raDeg": obj.coordinates.ra_deg,
            "decDeg": obj.coordinates.dec_deg,
            "frame": "ICRS",
            "originalFrame": obj.coordinates.original_frame,
            "originalValues": dict(obj.coordinates.original_values),
            "accuracyArcsec": obj.coordinates.accuracy_arcsec,
            "origin": obj.coordinates.origin,
        }
    )
    return _without_empty(
        {
            "uid": obj.uid,
            "primaryName": obj.primary_name,
            "commonName": obj.common_name,
            "aliases": list(obj.aliases),
            "typeCode": obj.type_code,
            "type": obj.type_name,
            "coordinates": coordinates,
            "shape": shape_dict(obj),
            "properties": dict(obj.properties),
            "sources": [source_ref_dict(source) for source in obj.sources],
            "catalogueGroups": list(obj.catalogue_groups),
            "crossIdentifications": list(obj.cross_identifications),
            "relatedSourceRefs": [source_ref_dict(source) for source in obj.related_source_refs],
        }
    )


def compact_object(obj: CatalogObject) -> dict[str, Any]:
    """Return the runtime record, omitting rich-only provenance and duplicates."""

    properties = dict(obj.properties)
    magnitude = properties.get("magnitude")
    catalog_source = " + ".join(source.catalogue for source in obj.sources)
    openngc_only = obj.catalogue_groups == ("openngc",) and len(obj.sources) == 1
    runtime_property_names = {
        "opacityClass",
        "brightnessClass",
        "brightnessScale",
        "areaSquareDeg",
        "densityClass",
        "densityScale",
        "notes",
        "colorClass",
        "surfaceBrightnessClass",
        "absorptionClass",
        "nebulaClass",
        "formClass",
        "structureClass",
        "associatedStarCount",
        "associatedIdentifiers",
        "illuminatingStarSpectralType",
        "illuminatingStarVMagnitude",
        "bluePlateRadiusArcmin",
        "redPlateRadiusArcmin",
        "complex",
        "morphologyClass",
        "appearanceCode",
        "galacticInclinationDeg",
        "remarkFlag",
        "sourcePropertyConflicts",
    }
    runtime_properties = {
        key: value for key, value in properties.items() if key in runtime_property_names
    }
    shape = None
    if not openngc_only and (
        obj.shape.kind != "point"
        or obj.shape.major_arcmin is not None
        or obj.shape.approximate
    ):
        shape = _without_empty(
            {
                "kind": obj.shape.kind if obj.shape.kind != "point" else None,
                "majorArcmin": obj.shape.major_arcmin,
                "minorArcmin": obj.shape.minor_arcmin,
                "positionAngleDeg": obj.shape.position_angle_deg,
                "approximate": True if obj.shape.approximate else None,
                "derivation": obj.shape.derivation,
            }
        )
    result = _without_empty(
        {
            "uid": None if openngc_only else obj.uid,
            "id": obj.primary_name,
            "name": obj.display_name if obj.display_name != obj.primary_name else None,
            "aliases": list(obj.aliases),
            "raDeg": obj.coordinates.ra_deg,
            "decDeg": obj.coordinates.dec_deg,
            "frame": "ICRS",
            "type": obj.type_name,
            "typeCode": obj.type_code,
            "catalogueGroups": None if openngc_only else list(obj.catalogue_groups),
            "catalogSource": catalog_source,
            "sources": None
            if openngc_only
            else [
                _without_empty(
                    {
                        "catalogue": source.catalogue,
                        "identifier": source.identifier,
                        "vizierId": source.vizier_id,
                    }
                )
                for source in obj.sources
            ],
            "shape": shape,
            "properties": runtime_properties,
            # Existing OpenNGC renderer compatibility without duplicating a
            # nested shape for 12,000+ records.
            "major": obj.shape.major_arcmin if openngc_only else None,
            "minor": obj.shape.minor_arcmin if openngc_only else None,
            "positionAngle": obj.shape.position_angle_deg if openngc_only else None,
            "mag": magnitude,
        }
    )
    return result


def legacy_openngc_object(obj: CatalogObject) -> dict[str, Any]:
    """Preserve the historical full OpenNGC shape at its legacy package path."""

    properties = dict(obj.properties)
    major = obj.shape.major_arcmin
    minor = obj.shape.minor_arcmin
    size = None
    if major is not None:
        size = f"{major:g} × {minor:g} arcmin" if minor is not None else f"{major:g} arcmin"
    return _without_empty(
        {
            "id": obj.primary_name,
            "catalogId": properties.get("catalogId", obj.primary_name),
            "name": obj.common_name or "",
            "ra": obj.coordinates.ra_deg / 15,
            "dec": obj.coordinates.dec_deg,
            "type": obj.type_name,
            "typeCode": obj.type_code,
            "con": properties.get("constellation"),
            "mag": properties.get("magnitude"),
            "magBand": properties.get("magnitudeBand"),
            "size": size,
            "major": major,
            "minor": minor,
            "positionAngle": obj.shape.position_angle_deg,
            "surfaceBrightness": properties.get("surfaceBrightness"),
            "hubble": properties.get("hubbleClass"),
            "redshift": properties.get("redshift"),
            "radialVelocity": properties.get("radialVelocityKmS"),
            "aliases": list(obj.aliases),
            "description": properties.get("notes") or _LEGACY_GENERIC_DESCRIPTIONS[obj.type_code],
            "catalogSource": "OpenNGC",
            "sourceFile": obj.sources[0].table if obj.sources else None,
        }
    )


def _meta(
    objects: list[CatalogObject],
    source_manifest: Mapping[str, Any],
    source_date_epoch: int | None,
) -> dict[str, Any]:
    groups = sorted({group for obj in objects for group in obj.catalogue_groups})
    catalogues = source_manifest.get("catalogues", {})
    if len(catalogues) == 1:
        key, entry = next(iter(catalogues.items()))
        version = entry.get("version") or entry.get("vizierId") or key
    else:
        version = "multi-source"
    result: dict[str, Any] = {
        "name": "Celestia Atlas offline DSO catalogue",
        "version": version,
        "schemaVersion": 1,
        "objectCount": len(objects),
        "coordinateFrame": "ICRS",
        "rightAscensionUnit": "degrees",
        "catalogueGroups": groups,
        "sourceManifestSchemaVersion": source_manifest.get("schemaVersion", 1),
    }
    if source_date_epoch is not None:
        generated = dt.datetime.fromtimestamp(source_date_epoch, dt.timezone.utc).replace(microsecond=0)
        result["generatedAt"] = generated.isoformat()
    return result


def _json(value: Any, *, pretty: bool = False) -> str:
    if pretty:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"


def _candidate_dict(candidate: DedupCandidate) -> dict[str, Any]:
    return {
        "leftUid": candidate.left_uid,
        "rightUid": candidate.right_uid,
        "separationArcmin": candidate.separation_arcmin,
        "reason": candidate.reason,
    }


def write_outputs(
    output_dir: Path,
    objects: Iterable[CatalogObject],
    *,
    source_manifest: Mapping[str, Any],
    candidates: Iterable[DedupCandidate] = (),
    ambiguous_cross_identifications: Iterable[tuple[str, tuple[str, ...]]] = (),
    source_date_epoch: int | None = None,
    legacy_openngc_outputs: bool = False,
) -> dict[str, Path]:
    """Write all outputs atomically per file and return their paths."""

    records = list(objects)
    meta = _meta(records, source_manifest, source_date_epoch)
    rich_payload = {"meta": meta, "objects": [rich_object(obj) for obj in records]}
    compact_payload = {"meta": meta, "objects": [compact_object(obj) for obj in records]}
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    values: dict[Path, str] = {
        data_dir / "dso-catalog.json": _json(rich_payload),
        data_dir / "dso-viewer-catalog.json": _json(compact_payload),
        data_dir / "catalog-sources.json": _json(dict(source_manifest), pretty=True),
        data_dir / "dedup-candidates.json": _json(
            {
                "schemaVersion": 1,
                "candidates": [_candidate_dict(value) for value in candidates],
                "ambiguousCrossIdentifications": [
                    {"normalizedIdentifier": key, "objectUids": list(object_uids)}
                    for key, object_uids in ambiguous_cross_identifications
                ],
            },
            pretty=True,
        ),
    }
    compact_meta = json.dumps(meta, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    compact_records = json.dumps(compact_payload["objects"], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    values[output_dir / "dso-catalog.js"] = (
        "// Generated offline catalogue. Coordinates are ICRS decimal degrees.\n"
        '"use strict";\n'
        f"window.DSO_CATALOG_META={compact_meta};\n"
        "window.OPENNGC_CATALOG_META=window.DSO_CATALOG_META;\n"
        f"window.DSO_CATALOG_DATA={compact_records};\n"
        "window.OPENNGC_DSO_DATA=window.DSO_CATALOG_DATA;\n"
        "(()=>{\n"
        "const full=window.DSO_CATALOG_DATA||[];\n"
        "const curated=Array.isArray(window.DSO_DATA)?window.DSO_DATA:[];\n"
        "const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');\n"
        "const curatedByKey=new Map();\n"
        "for(const item of curated)for(const value of [item.id,item.catalogId,item.name,...(item.aliases||[])]){const normalized=key(value);if(normalized&&!curatedByKey.has(normalized))curatedByKey.set(normalized,item);}\n"
        "const used=new Set();\n"
        "const merged=full.map(item=>{\n"
        "let extra=null;\n"
        "for(const value of [item.id,item.catalogId,item.name,...(item.aliases||[])]){extra=curatedByKey.get(key(value));if(extra)break;}\n"
        "if(!extra)return item;\n"
        "used.add(extra);\n"
        "const aliases=[...(item.aliases||[]),item.catalogId,extra.id,extra.catalogId,extra.name,...(extra.aliases||[])].filter(Boolean);\n"
        "const seen=new Set();\n"
        "const unique=aliases.filter(value=>{const normalized=key(value);if(!normalized||seen.has(normalized)||normalized===key(extra.id||item.id))return false;seen.add(normalized);return true;});\n"
        "return {...item,...extra,uid:item.uid,id:extra.id||item.id,catalogId:item.catalogId||extra.catalogId,raDeg:item.raDeg,decDeg:item.decDeg,frame:item.frame,typeCode:item.typeCode||extra.typeCode,catalogueGroups:item.catalogueGroups,sources:item.sources,shape:item.shape,properties:item.properties,aliases:unique,catalogSource:item.catalogSource};\n"
        "});\n"
        "for(const extra of curated)if(!used.has(extra))merged.push(extra);\n"
        "window.DSO_DATA=merged;\n"
        "})();\n"
    )
    if legacy_openngc_outputs:
        openngc = [obj for obj in records if "openngc" in obj.catalogue_groups]
        openngc_meta = _meta(openngc, source_manifest, source_date_epoch)
        openngc_source = source_manifest.get("catalogues", {}).get("openngc", {})
        openngc_meta.update(
            {
                "name": "OpenNGC offline DSO catalogue",
                "version": openngc_source.get("version"),
                "license": "CC-BY-SA-4.0",
                "attribution": "OpenNGC by Mattia Verga and contributors",
                "project": "https://github.com/mattiaverga/OpenNGC",
                "sources": list(openngc_source.get("sourceUrls", [])),
                "excludedTypes": list(openngc_source.get("excludedTypes", [])),
            }
        )
        values[data_dir / "openngc-catalog.json"] = _json(
            {"meta": openngc_meta, "objects": [legacy_openngc_object(obj) for obj in openngc]}
        )
        values[data_dir / "openngc-viewer-catalog.json"] = _json(
            {"meta": openngc_meta, "objects": [compact_object(obj) for obj in openngc]}
        )
        values[data_dir / "openngc-meta.json"] = _json(openngc_meta, pretty=True)

    written: dict[str, Path] = {}
    for path, text in values.items():
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(text, encoding="utf-8", newline="\n")
        temporary.replace(path)
        written[path.name] = path
    return written
