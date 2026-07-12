# Patch Mockup Service (mockup-only)

Realistic patch mockups for SALES: artwork + patch type in → a mockup constrained to
producible detail (never over-promising like an AI image generator), plus a vector for
the types that need one. It does **not** make machine files — the digitizer does the
real production work after the sale is secured.

**Full build plan & CRM integration:** see `MOCKUP-ENGINE-SPEC.md` (the single source of
truth; supersedes the older CLAUDE.md machine-file phases and the Phase-7 docs).

## API
```
POST /mockup       multipart: file, patch_type, width_mm, border_mm, base_hex, border_hex
                   -> { png_base64, svg, mockup_style, production_file, category,
                        colors[], warnings[], size_mm }
POST /mockup.png   same params -> raw PNG
GET  /             internal test bench (drag-drop, patch-type selector, warnings)
GET  /health       liveness
```
Optional `DIGITIZE_API_KEY` env enables `Authorization: Bearer` on the mockup endpoints.

## Run
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload            # http://localhost:8000
# or on the VPS:
docker compose up -d --build
```

## Outputs by patch type
- **Mockup PNG** — always, every type.
- **Vector SVG** — PVC, Silicone, Leather, Woven only (VTracer).
- Embroidery/Puff/Chenille/Sequin/Printed → mockup only.

## Make it yours
- **Thread chart:** replace `app/pipeline/threads.json` with the real Candle chart
  (code + name + RGB). The website chart is an image — provide structured data.
- **Categories & limits:** `app/pipeline/categories.json` — confirm sizes, colour caps,
  and detail floors with production.
- **Material looks:** `app/pipeline/materials.py` — 8 styles; leather/chenille/sequin are
  first-pass approximations to refine.

## Notes
- Deterministic: same artwork + params ⇒ identical mockup bytes.
- Uploads: PNG/JPG/WebP; rasterize PDF/AI/EPS upstream (add pdf2image + poppler).
- rembg is optional (better background removal for photos); see requirements.txt.
