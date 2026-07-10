# Local DSO images

Place downloaded or manually curated deep-sky images in this folder. The atlas
loads them locally and remains offline at runtime.

Recommended filenames use compact catalogue identifiers:

```text
m31.webp
m42.webp
ngc253.webp
ic434.webp
```

Supported browser formats are WebP, JPEG, PNG and AVIF. WebP at about
1600–2000 pixels is a good balance between detail and offline cache size.

## Download from NASA's publication library

First generate the complete OpenNGC catalogue:

```bash
python tools/build_openngc_catalog.py
```

Then download selected objects:

```bash
python tools/fetch_nasa_dso_images.py M31 "NGC 253" M42
```

Or process resumable batches:

```bash
python tools/fetch_nasa_dso_images.py --all --types galaxy --mag-max 11 --missing --limit 100
python tools/fetch_nasa_dso_images.py --all --types galaxy --mag-max 11 --missing --offset 100 --limit 100
```

The NASA library is a publication archive rather than an all-sky survey, so
many faint catalogue entries will not have a suitable result. Missing objects
are logged without stopping the batch.

## Manual image metadata

Place a JSON file beside an image using the same basename:

```json
{
  "object": ["M31", "NGC 224", "Andromeda Galaxy"],
  "title": "Andromeda Galaxy",
  "alt": "A detailed view of the Andromeda Galaxy",
  "credit": "NASA, ESA and the Hubble Heritage Team",
  "source": "https://example.org/source-page",
  "license": "Review the original source terms"
}
```

Rebuild the browser image index after adding files manually:

```bash
python tools/build_dso_image_index.py
```

The GitHub Pages workflow performs the indexing step automatically.
