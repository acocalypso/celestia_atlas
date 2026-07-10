# Local DSO images

Put offline deep-sky images in this folder. The recommended filename is the compact catalog identifier:

- `m31.webp`
- `m51.webp`
- `m104.webp`
- `ngc253.webp`
- `ngc5128.webp`

The app also understands aliases and descriptive names when the generated image index is present, for example `ngc-224.jpg` or `andromeda-galaxy.webp`.

Supported formats: WebP, JPEG, PNG and AVIF. WebP at roughly 1600–2000 pixels and under 1–2 MB is recommended for offline use.

## Optional attribution metadata

Place a JSON file beside the image with the same basename:

```json
{
  "object": ["M31", "NGC 224", "Andromeda Galaxy"],
  "title": "Andromeda Galaxy",
  "alt": "A wide view of the Andromeda Galaxy and its dust lanes",
  "credit": "NASA, ESA and the Hubble Heritage Team",
  "source": "https://example.org/source-page",
  "license": "NASA media usage guidelines"
}
```

Then run:

```bash
python tools/build_dso_image_index.py
```

The included GitHub Pages workflow runs that command automatically on deployment.
