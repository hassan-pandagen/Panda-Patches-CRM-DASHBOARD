# CLAUDE.md — Panda Patches Mockup Engine

> Read this first, every session. It is the **single source of truth** for the build.
> It supersedes all earlier docs (the old machine-file/DST plan, `PHASE-7-*` docs).
> Deep code that's too long to inline lives in `MOCKUP-ENGINE-SPEC.md` and the source
> files — this file points to them.
>
> **How we work:** one step at a time. Do a step → verify its **Done when** → tick the
> box → next. `[YOU]` = human (secrets, data, hardware, production sign-off).
> `[CC]` = Claude Code (writes/edits code, configs, runs commands).

---

## 0. Status — what's built vs. what to build

**Built & tested (in this repo):**
- The full mockup engine: constrain → texture → present.
- All **8 material looks** (`materials.py`).
- **Grid canvas + size-dimension arrows** output format (`canvas.py`).
- **Category routing, colour caps, size/detail warnings** (`mockup.py`, `categories.json`).
- **fal.ai FLUX finishing pass** with automatic **local fallback** (`finish_fal.py`).
- FastAPI service (`main.py`): `POST /mockup`, `POST /mockup.png`, bench, health.
- **RQ + Redis queue**: `POST /mockup/jobs` (CRM contract, JSON) enqueues; `app/worker.py`
  (single worker) processes and POSTs the result to `callback_url`. `GET
  /mockup/jobs/{job_id}` polls status (debugging aid). Code-complete, unit-tested
  (`pytest -q`, scoped via `pytest.ini` to `tests/`) — **not yet deploy-verified** (needs
  Phase 1 first).
- **PDF/PDF-compatible-AI rasterization** (`pipeline/ingest.py`, poppler) for non-raster
  uploads on both the bench and job paths; legacy PostScript EPS/AI is out of scope.
- Deploy scaffolding ready to use: `Caddyfile`, `docker-compose.yml` (redis/worker/caddy
  services), `.env.example`, `deploy.sh` — **not yet run against the real VPS.**

**Still to build:**
- Actually deploy to the VPS (Docker + Caddy + TLS) and verify the queue end-to-end there.
- **CRM integration:** 2 Edge Functions, DB migration, quote-side trigger, UI — **blocked
  on Supabase MCP access**, which [YOU] will grant.
- Drop in the **real Candle thread chart** (data dependency — see §10a).
- **Production sign-off** on `categories.json` values (see §7).

---

## 1. What we're building (scope)

A tool that, when a customer submits the quote form (artwork + patch type), generates a
**realistic, producible mockup (PNG)** — plus a **vector (SVG)** for the types that need
one — and attaches it to the quote in the CRM. Sales sends **quote + mockup together**,
secures the order, and only then the **digitizer does the real production work by hand.**

**Purpose:** a sales-acceleration tool. The mockup is deliberately constrained to what's
producible, so — unlike an AI image generator that over-promises — the customer approves
something we can actually make.

**Two outputs, nothing else:**
| Output | When |
|--------|------|
| **Mockup PNG** | always, every patch type |
| **Vector SVG** | PVC, Silicone, Leather, Woven only (VTracer) |

**OUT of scope (dropped, do not build):** DST/PES/EMB machine files, run sheets, stitch
digitizing, sew calibration, machine-file testing. The engine never makes a machine file.

---

## 2. Hard rules — never violate

1. **Engine runs on the VPS only.** Python + OpenCV + multi-second CPU work cannot run in
   Supabase Edge Functions (Deno) or Vercel serverless. Vercel = frontend + proxy only.
2. **Touch the CRM only for the mockup trigger + display.** Do not read, modify, or
   integrate any other CRM data, tables, or flows. This feature is additive.
3. **The VPS never holds a Supabase key.** It gets only `DIGITIZE_API_KEY` and
   `DIGITIZE_CALLBACK_SECRET`. The callback Edge Function holds the service role. (The VPS
   processes untrusted uploads, so a compromise there must not reach the database.)
4. **fal.ai = image-to-image, NEVER `schnell`.** Schnell is text-to-image; it invents a
   patch from a prompt and will not reproduce the customer's uploaded logo.
5. **The mockup is NOT pixel-exact and that's intended.** It's a producible representation
   (colours quantized to thread chart, detail below limits dropped). Always keep the
   warnings. Pixel-exact only ever comes from the post-sale digitized file.
6. **Keep determinism where possible.** Local render is seeded; fal is seeded per design.
7. **Confirm `categories.json` values with production** before calling anything "done."
8. **Colour accuracy depends on the real Candle thread chart** (§10a). Until it's in, the
   engine runs on a starter palette — fine for shape/detail, not colour.
9. Prefer minimal, focused edits over rewrites. Add a short test for each new logic piece.

---

## 3. Architecture

```
Customer -> quote form (website / CRM)
     |  artwork uploaded -> Supabase Storage (existing)
     v
Edge Function: request-mockup
     |  reads patch_type -> picks mockup_style + mode
     |  signs a read URL for the artwork, POSTs the job to the VPS
     v
VPS  POST /mockup/jobs   (auth: DIGITIZE_API_KEY)
     |  enqueue on RQ -> returns job_id immediately
     v
RQ worker (single, one job at a time)   <- this is the "2 quotes at once" answer
     |  CONSTRAIN (quantize->thread colours, colour cap, warnings)
     |  TEXTURE   (fal FLUX img2img, or local materials fallback)
     |  PRESENT   (grid canvas + size arrows)
     |  POSTs results to the callback (auth: DIGITIZE_CALLBACK_SECRET)
     v
Edge Function: mockup-callback   (holds Supabase service role)
     |  uploads PNG (+SVG) to the `mockups` bucket, updates the quote/order row
     v
Supabase Realtime -> CRM React UI: mockup + colours + warnings, live

Hosting:  Vercel Pro = CRM frontend + /api/mockup/* proxy   ·   VPS (4 GB) = engine + RQ + Redis + Caddy
Existing CRM: React + TS + Supabase (untouched except the trigger + display)
```

---

## 4. Repository structure

```
patch-mockup/
├── CLAUDE.md                    this file — source of truth
├── MOCKUP-ENGINE-SPEC.md        deep spec: API contract, Edge Fns, migration (reference)
├── README.md
├── Dockerfile · docker-compose.yml · Caddyfile · .env.example · deploy.sh
├── vercel.json · requirements.txt · pytest.ini
├── tests/                       pytest suite (conftest.py, test_ingest/jobs/api_jobs.py)
└── app/
    ├── main.py                  FastAPI: /mockup, /mockup.png, /mockup/jobs, /, /health
    ├── worker.py                RQ worker entrypoint (single worker, one job at a time)
    ├── demo.html                internal test bench (patch-type selector + warnings)
    └── pipeline/
        ├── engine.py            prepare(): bg-removal -> trim -> quantize -> silhouette + border
        ├── quantize.py          k-means -> snap colours to thread chart (CIELAB)
        ├── materials.py         the 8 looks + flat_render() (fed to fal) + directional fill
        ├── canvas.py            grid background + size-dimension arrows
        ├── finish_fal.py        optional fal.ai FLUX img2img finishing pass
        ├── ingest.py            PDF/PDF-compatible-AI -> PNG rasterization (poppler)
        ├── jobs.py               RQ job: fetch artwork -> generate() -> POST callback_url
        ├── mockup.py            generate(): orchestrator (constrain->texture->present + warnings)
        ├── categories.json      per-type spec (mockup_style, output, size/colour/detail limits)
        └── threads.json         thread chart — REPLACE with real Candle data
```

Where to change things:
- **New endpoint / API shape** -> `app/main.py`
- **Queue / job processing / callback POST** -> `app/pipeline/jobs.py`, `app/worker.py`
- **Non-raster upload handling (PDF/AI)** -> `app/pipeline/ingest.py`
- **Category behaviour, limits, warnings** -> `app/pipeline/categories.json` + `mockup.py`
- **Material look** -> `app/pipeline/materials.py`
- **fal prompt / strength** -> `app/pipeline/finish_fal.py`
- **Colour matching** -> `app/pipeline/quantize.py`
- **Mockup framing (grid/arrows)** -> `app/pipeline/canvas.py`

---

## 5. Commands

```bash
# Local dev
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload            # http://localhost:8000  (bench at /)
curl -s localhost:8000/health

# VPS
docker compose up -d --build
docker compose logs -f mockup

# Tests
pytest -q
```
Stack: Python 3.12 · FastAPI · OpenCV(headless) · Pillow · NumPy · VTracer.
Optional: `fal-client` (FLUX finishing, needs `FAL_KEY`), `rembg`+`onnxruntime` (photo bg removal), `rq`+`redis` (queue).

---

## 6. The pipeline (constrain -> texture -> present)

`app/pipeline/mockup.py::generate(artwork_bytes, patch_type, …)` returns:
```
{ png, svg, mockup_style, production_file, category, colors[], warnings[], size_mm, render_source }
```

1. **Constrain** (`engine.prepare` + `quantize`): background removal (corner-key, or rembg
   if installed) -> trim to artwork -> k-means quantize -> **snap to thread chart in CIELAB**
   -> **cap colours per category** -> silhouette + border ring. This yields a producible,
   colour-reduced design. Then compute **warnings** (size / detail / colour).
2. **Texture:** `finish="auto"` (default) uses **fal FLUX img2img** when `FAL_KEY` is set,
   else the deterministic **local** `materials.render(style)`. On any fal error it falls
   back to local automatically. `render_source` reports `fal-flux` | `local` | `local-fallback`.
   - fal path feeds `materials.flat_render(ctx)` (flat producible image) to FLUX so the AI
     adds *texture only*, never impossible detail.
3. **Present:** `canvas.present(rgba, width_mm)` places the patch on a grey grid and draws
   the horizontal + vertical **dimension arrows with inch labels** (matches Panda's
   reference mockups). Width from `width_mm`; height from the rendered aspect.

Determinism: local render is seeded; fal is seeded per design (`seed` in `finish_fal.py`).

---

## 7. Categories, outputs & limits — `categories.json`

Source of truth for `mockup_style`, `production_file`, size caps, colour caps, detail
floors. **[YOU] confirm every row with production.** Summary:

| Category | mockup_style | production_file | Max size | Max colours | Key limits / notes |
|----------|--------------|-----------------|----------|-------------|--------------------|
| Embroidery | embroidery | dst* | flexible | 12 | text >=5 mm (warn <6), line >=1 mm (warn <1.3) |
| 3D Puff | puff | dst* | flexible | **2** | columns 3-10 mm, bold only, no fine detail, requires_review |
| PVC | molded_pvc | vector | **8 in** | 10 | **colour walls** (hard cells, no bleed) |
| Silicone | molded_pvc | vector | **8 in** | 8 | plotter/laser cut, colour-walled |
| Woven | woven | vector | **8 in** | 8 | finer detail than embroidery; loom file external |
| Printed | flat_print | vector | flexible | unlimited | gradients OK, photographic |
| Leather | leather | vector | flexible | 2 | laser engrave, tonal |
| Chenille | chenille | none_manual | flexible | 4 | high min ~3 in, bold only; specialist makes file |
| Chenille TPU | chenille | none_manual | flexible | 4 | as chenille |
| Chenille Glitter | chenille | none_manual | flexible | 4 | as chenille |
| Sequin | sequin | none_manual | flexible | 6 | min feature ~7 mm, min ~3 in; specialist file |

`production_file` is a **label** telling the CRM the downstream path (mockup-only scope —
no file is auto-generated): `dst` = "our team hand-digitizes after the sale", `vector` =
"SVG produced now", `none_manual` = "specialist makes the file". Sizes flexible **except
Woven/PVC/Silicone = 8 in max**; chenille/sequin practical minimums surface as warnings.

*Confirm `3D Embroidered Transfers` = puff (production said DST/puff — verify the label).

---

## 8. The 8 material looks (`materials.py`)

All deterministic; `mockup_style` per type from `categories.json`.

| Style | Used by | Status |
|-------|---------|--------|
| embroidery | Embroidered | solid — directional satin (per-component PCA), twill base, merrow border |
| puff | 3D Puff | solid — satin + domed crown (raised foam) + heavier shadow |
| molded_pvc | PVC, Silicone | solid — flat cells + gloss + **raised colour walls** + rubber rim |
| woven | Woven | solid — tight fine weave over flat colours |
| flat_print | Printed | solid — near-flat colours, faint tooth, stitched edge |
| leather | Leather | approx — refine (fal renders it better) |
| chenille | Chenille (+TPU/Glitter) | approx — refine (fal renders it better) |
| sequin | Sequin | approx — refine (fal renders it better) |

Never render the embroidery texture for a molded/printed type. With fal enabled, the AI
renders all 8 (esp. leather/chenille/sequin) more convincingly than the local textures.

---

## 9. fal.ai FLUX finishing (optional — `finish_fal.py`)

- Endpoint: **`fal-ai/flux/dev/image-to-image`** (~$0.03/megapixel, seed-able, ~3 s).
  **NEVER `schnell`** (text-to-image — won't reproduce the uploaded logo).
- Safe because the input is the **constrained flat render** — FLUX adds texture, not
  impossible detail. Warnings still apply. Per-material prompts + strength are in the file.
- Enable: `pip install fal-client`, set env `FAL_KEY`. `finish` param: unset/`auto` -> fal
  if key present else local; `fal` -> force; `local` -> force local.
- Trade-offs (documented, accepted): paid API; customer artwork sent to a third party;
  output varies unless seeded (it is); FLUX may nudge very small text (keep warnings).

---

## 10. CRM integration

### 10a. [YOU] provide once
- [ ] `openssl rand -hex 32` twice -> `DIGITIZE_API_KEY`, `DIGITIZE_CALLBACK_SECRET`.
- [ ] Supabase secrets: `supabase secrets set DIGITIZE_API_KEY=… DIGITIZE_CALLBACK_SECRET=… DIGITIZE_SERVICE_URL=https://api.pandapatches.com`.
      (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` auto-inject into Edge Functions — don't set.)
- [ ] VPS `.env`: the same two secrets, plus optional `FAL_KEY` for FLUX.
- [ ] Confirm: artwork **bucket** (assumed `order-attachments`), patch-type **column**
      (assumed `patch_type`), exact patch-type **strings** you store.
- [ ] **Candle thread chart** as CSV/JSON (code + name + RGB).

### 10b. DB migration (CRM repo)
```sql
alter table public.quotes
  add column if not exists mockup_status text default 'pending'
    check (mockup_status in ('pending','queued','processing','ready','failed')),
  add column if not exists mockup_url      text,
  add column if not exists vector_url      text,       -- SVG: PVC/silicone/leather/woven only
  add column if not exists mockup_style    text,
  add column if not exists mockup_meta     jsonb,       -- { colors[], size_mm, production_file, render_source }
  add column if not exists mockup_warnings jsonb,
  add column if not exists mockup_job_id   text,
  add column if not exists mockup_error    text,
  add column if not exists mockup_at       timestamptz;
-- repeat the same columns on public.orders; carry them over on convert-to-order.
alter table public.orders
  add column if not exists mockup_intent text default 'full'
    check (mockup_intent in ('full','no_approval','reuse_parent','skip')),
  add column if not exists parent_order_id uuid references public.orders(id);

insert into storage.buckets (id,name,public) values ('mockups','mockups',false)
  on conflict (id) do nothing;
create policy "staff read mockups" on storage.objects for select
  to authenticated using (bucket_id = 'mockups');
```

### 10c. API contract
**CRM -> VPS** `POST /mockup/jobs` (`Authorization: Bearer <DIGITIZE_API_KEY>`):
```json
{ "entity_type":"quote", "entity_id":"<uuid>", "patch_type":"Embroidered",
  "artwork_url":"<signed read url>",
  "params": {"width_mm":80,"border_mm":3,"base_hex":"#232830"},
  "callback_url":"https://<proj>.supabase.co/functions/v1/mockup-callback" }
```
-> immediate `{ "job_id":"…", "status":"queued" }`.

**VPS -> CRM** `POST <callback_url>` (`Authorization: Bearer <DIGITIZE_CALLBACK_SECRET>`):
```json
{ "entity_type":"quote","entity_id":"<uuid>","job_id":"…","status":"ready",
  "mockup_style":"embroidery","production_file":"dst","render_source":"fal-flux",
  "files":{"png_base64":"…","svg":"<svg>…</svg>"},
  "colors":[{"code":"T-063","name":"Navy","hex":"#152A55"}],
  "warnings":["…"], "size_mm":[80,70] }
```
Failure: `{ …, "status":"failed", "error":"empty artwork" }`.

### 10d. Edge Functions (CRM repo, Deno)
- **`request-mockup`**: honour `mockup_intent` first (`skip`/`reuse_parent` -> don't call
  the VPS; for reuse, copy the parent's mockup fields); skip if the upload is already a
  finished asset; else sign artwork URL, POST to the VPS, set `mockup_status='queued'`.
- **`mockup-callback`**: verify the bearer secret -> upload PNG (+SVG) to `mockups` ->
  update the row (`mockup_status='ready'`, urls, `mockup_style`, `mockup_meta`,
  `mockup_warnings`). Enter Awaiting Approval + email only when the intent was `full`.
- Full skeletons: see `MOCKUP-ENGINE-SPEC.md` §5-6 (rename `request-digitize`->
  `request-mockup`, `digitize-callback`->`mockup-callback`; drop all DST fields).

### 10e. UI (CRM, React + TanStack Query + Supabase Realtime)
- [ ] Trigger `supabase.functions.invoke('request-mockup', …)` after quote artwork upload.
- [ ] `MockupStatus` chip (`queued/processing/ready/failed`) on quote detail + quotes list + order detail.
- [ ] On `ready`: show the mockup (signed URL), colour chips, and a **yellow warnings
      banner** (so sales sets expectations); download SVG when present.
- [ ] Realtime subscription on the row -> live fill-in (same pattern you use for orders).
- [ ] Repeat Order copies the parent's mockup fields instead of regenerating.

### 10f. VPS engine changes for the CRM ([CC])
- [x] `POST /mockup/jobs` accepts the CRM payload: fetch `artwork_url`, use `patch_type`,
      `params`, `callback_url`, `entity_type/id`. (Bearer check wired in `main.py`; note
      the path is `/mockup/jobs`, not literally `/mockup` — that path stays the
      synchronous multipart bench endpoint, unchanged, so the internal test bench keeps
      working.)
- [x] Enqueue on **RQ** (single worker); return `job_id` at once; worker (`app/worker.py`)
      POSTs results to `callback_url` with the callback secret (fail -> POST
      `{status:"failed",error}`). Code-complete + unit-tested; **not yet run against a
      real Redis/VPS** — do that as part of Phase 1/2 deploy.
- [x] `vtracer` (SVG) already in `requirements.txt`; `fal-client` stays optional/commented
      (enable when [YOU] set `FAL_KEY`, per Phase 5).
- [x] Rasterize non-raster uploads (PDF/PDF-compatible-AI via pdf2image + poppler, see
      `pipeline/ingest.py`); legacy PostScript EPS/AI isn't supported — returns a clear
      error rather than crashing. Poppler added to the Docker image.

---

## 11. Build plan (phased)

### Phase 0 — Local run
- [ ] **[YOU]** Unzip `patch-mockup`, install Python 3.12, open in VS Code.
- [ ] **[CC]** venv + install; `uvicorn` up; hit `/`; smoke test `generate()` across patch types.
- **Done when:** the bench renders a mockup with the correct look + warnings for a chosen type.

### Phase 1 — Deploy engine to the VPS
- [ ] **[YOU]** DNS `api.pandapatches.com` -> VPS; install Docker; add 2 GB swap; open 80/443.
- [x] **[CC]** `ALLOWED_ORIGINS` already env-driven; `Caddyfile` (TLS) + `deploy.sh` written
      and ready — **not yet run** (waiting on VPS access, per [YOU]).
- **Done when:** `curl https://api.pandapatches.com/health` returns ok over HTTPS.

### Phase 2 — Queue
- [x] **[CC]** Add Redis service + `rq`/`redis`; `POST /mockup/jobs` enqueues and returns
      `job_id`; `app/worker.py` single worker; worker POSTs to `callback_url`. Code done,
      unit-tested locally (`pytest -q`, 11 tests passing) with a fake Redis/queue —
      **not yet run against a real Redis instance.**
- **Done when:** two rapid uploads run sequentially (worker log), each returns a `job_id`
  — **verify this once Phase 1 deploy is done** (needs a real `docker compose up` with the
  `redis`/`worker` services, not just unit tests).

### Phase 3 — Real thread chart
- [ ] **[YOU]** Provide Candle chart as code+name+RGB (CSV/JSON) — Sanity export, official
      chart, or transcription.
- [ ] **[CC]** Convert to `threads.json`; verify snapping returns real Candle codes.
- **Done when:** a known-colour logo maps to the right Candle codes in `colors[]`.

### Phase 4 — CRM integration
- **Blocked:** [YOU] to grant Supabase MCP access (CRM lives on Supabase) before any of
  this can be written — also confirm the bucket/column/table names assumed in §10a.
- [ ] **[CC]** Migration (§10b) + convert-to-order carry-over.
- [ ] **[CC]** `request-mockup` + `mockup-callback` Edge Functions.
- [ ] **[YOU]** Set secrets (§10a); `supabase db push`; deploy functions.
- [ ] **[CC]** Quote-side trigger, status chip, mockup + colours + warnings banner, Realtime, repeat reuse.
- **Done when:** on the live CRM, uploading artwork to a quote shows
  `queued->processing->ready` live, then the mockup + colours + warnings; two at once don't overlap.

### Phase 5 — fal FLUX finishing (optional, when ready)
- [ ] **[YOU]** Create a fal account; set `FAL_KEY` on the VPS; `pip install fal-client`.
- [ ] **[CC]** Test `finish="fal"` on 5-10 real logos at a few `strength` values per material; tune.
- **Done when:** FLUX mockups look right per material and `render_source` reports `fal-flux`,
  with local fallback confirmed when the key is unset.

### Production sign-off (parallel, gating "done")
- [ ] **[YOU]** Confirm every `categories.json` row (sizes, colour caps, detail floors,
      puff limits, the puff-vs-transfer label).

### Acceptance
- [ ] **[YOU]** Embroidery quote -> stitched mockup; PVC -> glossy walled mockup + SVG; puff
      with >2 colours -> mockup + colour warning; chenille @ small size -> mockup + size
      warning; Repeat Order -> instant reuse, no regeneration; a "no-approval" order ->
      mockup generated, no customer email.
- **Done when:** all behave as above and the mockup matches what's actually producible.

---

## 12. Known caveats (set expectations)

- **Mockups are not pixel-exact.** They're producible representations: colours quantized to
  thread chart, detail below limits dropped, colours capped. This is intended — it secures
  the sale honestly. Pixel-exact only comes from the post-sale digitized file.
- **Colour accuracy waits on the real Candle chart.** Starter palette until then.
- **`categories.json` values are defaults** pending production sign-off.
- **fal path:** paid, third-party (artwork leaves your infra), seeded but not identical
  run-to-run, and small text can still shift — warnings stay on regardless.

---

## 13. Cost

- **VPS:** ~$5-12/month (already have it) — the real cost.
- **fal.ai (optional):** ~$0.03 per **megapixel** (not per image). At ~20 mockups/month
  ~= **$0.60**; even ~900/month ~= $27. Keep mockups ~1 MP; budget **$25/month** as a
  comfortable cushion. Don't render at 2-4 MP or run many strength variations per quote.
- **Vercel Pro:** already have it (frontend + proxy).
- **Otherwise required APIs:** $0 (VTracer, OpenCV, etc. are open-source on your VPS).

---

## 14. Glossary

- **Mockup** — the realistic PNG the customer approves; constrained to producible detail.
- **Vector (SVG)** — clean outline for PVC/silicone (mould/cut) and woven/leather.
- **mockup_style** — which of the 8 material looks to render.
- **production_file** — downstream-path label (dst = hand-digitized after sale; vector =
  SVG made; none_manual = specialist file). No file is auto-generated in this scope.
- **Constrain -> Texture -> Present** — the three pipeline stages.
- **fal img2img** — FLUX image-to-image finishing pass (NOT schnell/text-to-image).
- **DST / EMB** — machine / editable embroidery files. **Out of scope** — the digitizer
  makes these by hand after the sale.
