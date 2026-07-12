# Panda Patches — Mockup Engine (consolidated spec)

> **This is the single source of truth. It SUPERSEDES:** the machine-file parts of
> `CLAUDE.md` (old Phases 2 and 5 — calibration and DST), `PHASE-7-CRM-INTEGRATION.md`,
> and `PHASE-7-ADDENDUM-CATEGORIES-AND-SIZE.md`. Where those disagree with this file,
> this file wins. Keep `CLAUDE.md`'s general project rules (§1–7 of it); ignore its
> DST/queue-for-machine-files specifics.

---

## 1. Scope (read first)

**Goal:** when a customer submits the quote form (artwork + patch type), generate a
**realistic mockup (JPEG/PNG)** — plus a **vector (SVG)** for the types that need one —
and attach it to the quote in the CRM, so **sales sends the quote *with* the mockup**,
secures the order, and only then the **digitizer does the real production work by hand**.

**In scope:** the mockup, the vector, category-aware looks, size/detail/colour
**warnings**, and the CRM wiring to trigger it on quote upload and show the result.

**OUT of scope (dropped entirely):** DST/PES/EMB generation, run sheets, stitch
digitizing, sew calibration, machine-file testing. The engine never produces a
machine file. `pyembroidery`, `digitize.py`, `exporter.py` are removed.

**Why this shape:** an AI image generator makes over-detailed mockups that can't be
produced, so customers approve the impossible. This engine is the honest counterpart —
deterministic and constrained to producible detail per material.

---

## 2. Two outputs

| Output | When | Notes |
|--------|------|-------|
| **Mockup PNG** | **always**, every patch type | the customer-facing image |
| **Vector SVG** | **PVC, Silicone, Leather, Woven** only | feeds mould/cut/laser; via VTracer |

Embroidery, Puff, Chenille, Chenille TPU, Chenille Glitter, Sequin, Printed →
**mockup only** (no SVG). The `production_file` field in the result is just a label
telling the CRM/UI the downstream path: `dst` = "our team hand-digitizes after the
sale", `vector` = "SVG produced now", `none_manual` = "specialist makes the file".

---

## 3. The engine (already built — `patch-mockup` repo)

Single entry point: `app/pipeline/mockup.py` → `generate(artwork_bytes, patch_type, …)`
returns `{ png, svg, mockup_style, production_file, category, colors[], warnings[], size_mm }`.

Pipeline: `engine.prepare()` (background removal → trim → quantize to a per-type colour
cap → snap to thread chart → silhouette + border ring) → `materials.render(style, ctx)`
→ warnings → optional VTracer SVG.

Modules: `engine.py` (prepare + shared geometry), `quantize.py` (colour → thread
snap in CIELAB), `materials.py` (the 8 looks), `mockup.py` (orchestrator + warnings +
vector), `categories.json` (the per-type spec), `threads.json` (thread chart).

Files: `app/main.py` exposes `POST /mockup` (JSON), `POST /mockup.png` (raw), `GET /`
(bench), `GET /health`. Optional `DIGITIZE_API_KEY` enables bearer auth.

---

## 4. The 8 material looks (`materials.py` — built, refine as needed)

All deterministic. `mockup_style` per type comes from `categories.json`.

| Style | Used by | How it renders | Status |
|-------|---------|----------------|--------|
| `embroidery` | Embroidered | directional satin per region + sheen + twill base + merrow border | solid |
| `puff` | 3D Puff | satin + domed crown per region (raised foam) + heavier shadow | solid |
| `molded_pvc` | PVC, Silicone | flat colour cells + gloss + **raised colour walls** (no bleed) + rubber rim | solid |
| `woven` | Woven | tight fine cross-hatch weave over flat colours | solid |
| `flat_print` | Printed | near-flat colours, faint fabric tooth, stitched edge | solid |
| `leather` | Leather | duotone deboss/engrave on leather-grain base | approx — refine |
| `chenille` | Chenille (+TPU/Glitter) | soft fuzzy loop texture, softened edges, merrow border | approx — refine |
| `sequin` | Sequin | grid of reflective discs with specular highlight | approx — refine |

Refinement is welcome but not blocking — the four "solid" looks cover the highest-volume
types. **Never** render the embroidery texture for a molded/printed type.

---

## 5. Categories & limits — `categories.json`

Source of truth for `mockup_style`, `production_file`, size caps, colour caps, and
detail floors. Key facts baked in (from production + research):

- **DST-lane types (hand-digitized after sale):** Embroidery, 3D Puff. Puff carries
  hard limits — columns 3–10 mm, **2 colours max**, bold shapes only, `requires_review`.
- **Vector types:** PVC, Silicone (plotter/laser cut), Leather (laser engrave), Woven.
  **PVC + Silicone → `color_walls: true`** (hard cells, raised divider, no bleed).
- **Mockup-only / specialist file:** Chenille (+ TPU, Glitter), Sequin.
- **Sizes:** flexible everywhere **except Woven / PVC / Silicone = max 8 in**. Chenille
  and Sequin have a high *practical minimum* (~3 in) surfaced as a warning, not a hard cap.
- **Colours:** Embroidery ≤ 12; Puff ≤ 2; Printed unlimited (gradients OK); others as listed.
- **Detail floors (warnings):** Embroidery text ≥ 5 mm, line ≥ 1 mm; Puff line ≥ 3 mm.

**[YOU] confirm each row with production**, exactly like the thread chart. Values are
industry-standard starting points.

---

## 6. Thread chart — the one thing still needed

Colour snapping needs **Candle threads as structured data: `code + name + hex/RGB`** in
`app/pipeline/threads.json`. The chart at `pandapatches.com/assets/thread-color-chart`
is an **image only** — not usable directly, and screen swatches aren't colour-accurate.

- [ ] **[YOU]** Provide the Candle chart as CSV/JSON (official RGB list, or a Sanity CMS
      export of the chart's structured content, or a one-time transcription).
- [ ] **[CC]** Convert it into `threads.json`; verify snapping returns real Candle codes.

Until then the engine runs on the starter palette (fine for shape/detail, not colour-exact).

---

## 7. CRM integration (trimmed — mockup-only)

Same architecture as before, **minus everything DST**. Engine stays on the VPS; the
CRM triggers it and shows the result. Two simultaneous quotes → the VPS **queue** runs
them one at a time (single RQ worker) — that's the "2 quotes at once" answer.

### 7a. What you provide (once)
- [ ] **[YOU]** `openssl rand -hex 32` twice → `DIGITIZE_API_KEY`, `DIGITIZE_CALLBACK_SECRET`.
- [ ] **[YOU]** Supabase secrets: `supabase secrets set DIGITIZE_API_KEY=… DIGITIZE_CALLBACK_SECRET=… DIGITIZE_SERVICE_URL=https://api.pandapatches.com`.
- [ ] **[YOU]** VPS `.env`: the same two secrets. (No Supabase key on the VPS.)
- [ ] **[YOU]** Confirm: artwork **bucket name** (assumed `order-attachments`), patch-type
      **column** (assumed `patch_type`), and the exact patch-type **strings** you store.

### 7b. Database (CRM repo migration)
```sql
alter table public.quotes
  add column if not exists mockup_status text default 'pending'
    check (mockup_status in ('pending','queued','processing','ready','failed')),
  add column if not exists mockup_url      text,
  add column if not exists vector_url      text,        -- SVG, PVC/silicone/leather/woven only
  add column if not exists mockup_style    text,
  add column if not exists mockup_meta     jsonb,        -- { colors[], size_mm, production_file }
  add column if not exists mockup_warnings jsonb,
  add column if not exists mockup_job_id   text,
  add column if not exists mockup_error    text,
  add column if not exists mockup_at       timestamptz;
-- mirror the same columns onto public.orders, and carry them over on convert-to-order.

insert into storage.buckets (id, name, public)
values ('mockups','mockups', false) on conflict (id) do nothing;
create policy "staff read mockups" on storage.objects for select
  to authenticated using (bucket_id = 'mockups');
```

### 7c. Flow & functions
- **`request-mockup`** (Edge Function): on quote artwork upload → read `patch_type`,
  sign a read URL for the artwork, POST to the VPS `POST /mockup` (bearer
  `DIGITIZE_API_KEY`) with `entity_type/entity_id/patch_type/params/callback_url`, set
  `mockup_status='queued'`. Honour a `digitize_intent`-style skip for repeats (reuse the
  parent quote/order's `mockup_url` instead of regenerating).
- **VPS**: enqueue on RQ, return `job_id` immediately; worker renders and POSTs results
  (base64 PNG, SVG string, `mockup_style`, `colors`, `warnings`, `size_mm`,
  `production_file`) to `callback_url` (bearer `DIGITIZE_CALLBACK_SECRET`).
- **`mockup-callback`** (Edge Function, holds service role): verify secret → upload PNG
  (and SVG if present) to the `mockups` bucket → update the row (`mockup_status='ready'`,
  urls, `mockup_style`, `mockup_meta`, `mockup_warnings`). Realtime pushes it to the UI.

### 7d. UI (CRM, React)
- [ ] Trigger `request-mockup` after quote artwork upload.
- [ ] Status chip on the quote (and quotes list): `queued → processing → ready → failed`.
- [ ] On ready: show the mockup (signed URL), the colour chips, and a **yellow warnings
      banner** (so sales sets expectations before sending). Download SVG when present.
- [ ] Realtime subscription on the row (you already do this for orders) → live update.
- [ ] Repeat Order copies the mockup fields from the parent instead of regenerating.

---

## 8. VPS engine changes for the CRM (small — [CC])

- [ ] Accept the CRM payload on `/mockup`: `artwork_url` (fetch it), `patch_type`,
      `params`, `callback_url`, `entity_type`, `entity_id`. (`DIGITIZE_API_KEY` bearer
      check is already wired in `main.py`.)
- [ ] Enqueue on RQ (single worker); return `job_id` at once.
- [ ] Worker POSTs the full result to `callback_url` with the callback secret; on error,
      POST `{status:"failed", error}`.
- [ ] Ensure `vtracer` is installed in the Docker image (already in `requirements.txt`).
- [ ] For non-raster uploads (PDF/AI/EPS): rasterize first (add `pdf2image` + poppler);
      if that fails, return a warning rather than crashing.

Deploy: `docker compose up -d --build` on the VPS; Vercel Pro serves the frontend +
the `/api/mockup/*` rewrite proxy (unchanged).

---

## 9. Checklist

### Engine (mostly done)
- [x] 8 material looks render (`materials.py`).
- [x] Category routing + colour cap + warnings (`mockup.py`, `categories.json`).
- [x] `/mockup` + `/mockup.png` + bench (`main.py`, `demo.html`).
- [ ] **[CC]** RQ queue + `callback_url` POST from the worker.
- [ ] **[CC]** VTracer verified on the VPS; PDF/AI rasterize path.
- **Done when:** `POST /mockup` with a patch type returns the right style + warnings,
  and a PVC/woven job returns an SVG.

### Data
- [ ] **[YOU]** Candle chart as code+RGB → **[CC]** build `threads.json`.
- [ ] **[YOU]** Confirm each `categories.json` row with production.
- [ ] **[YOU]** Confirm `3D Embroidered Transfers` = puff (it is) and the exact patch-type strings.

### CRM
- [ ] **[CC]** Migration (§7b) + convert-to-order carry-over.
- [ ] **[CC]** `request-mockup` + `mockup-callback` Edge Functions.
- [ ] **[YOU]** Set secrets (§7a); `supabase db push`; deploy functions.
- [ ] **[CC]** Quote-side trigger, status chip, mockup + colours + warnings banner, Realtime.
- **Done when:** on the live CRM, uploading artwork to a quote shows
  `queued → processing → ready` live, then the mockup + colours + any warnings — and two
  uploads within a second run sequentially on the VPS (no overlap).

### Acceptance
- [ ] **[YOU]** Run: embroidery quote → stitched mockup; PVC quote → glossy walled mockup
      + SVG; puff quote with >2 colours → mockup + colour warning; chenille @ small size →
      mockup + size warning; a Repeat Order → instant reuse, no regeneration.
- **Done when:** all five behave as above and the mockup matches what's actually producible.

---

## 10. Optional: photoreal finishing pass (fal.ai FLUX)

The engine can hand the **constrained flat render** to fal's FLUX image-to-image
(`fal-ai/flux/dev/image-to-image`, ~$0.03/MP, seed-able) to make it photoreal.
**Why it's safe:** the input is already reduced to producible thread colours and
detail, so FLUX adds *texture*, not impossible detail — it does NOT reintroduce the
over-detailed-AI problem, and the size/colour **warnings still apply**. It also renders
the hard materials (chenille, sequin, leather) far better than the hand-coded textures.

- **Do NOT use FLUX *schnell*** — that's text-to-image; it invents a patch from a prompt
  and will not reproduce the customer's uploaded artwork. Must be *image-to-image*.
- Pipeline layering: **constrain (local: quantize + colour cap + warnings) → texture
  (fal FLUX img2img, per-material prompt + seed) → present (local: grid canvas + size
  arrows)**. `materials.py` textures remain the free offline fallback.
- Enable: `pip install fal-client`, set env `FAL_KEY`, call `generate(..., finish="fal")`
  (or leave `finish` unset — it auto-uses fal when the key is present, else local).
  Result includes `render_source`: `fal-flux` | `local` | `local-fallback`.
- Trade-offs to accept: paid API; customer artwork is sent to a third party (fal);
  output varies unless seeded (it is seeded per design); FLUX may still slightly alter
  very small text, so keep showing the warnings. Code: `app/pipeline/finish_fal.py`.
