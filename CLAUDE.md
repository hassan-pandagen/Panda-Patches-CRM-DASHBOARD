# CLAUDE.md — Patch Generator (Panda Patches CRM repo)

> **This file is for the CRM repo** (React 18 + TS + Vite + Supabase + Vercel). It covers
> adding ONE standalone page — the **Patch Generator** — that calls the mockup engine
> running on the VPS.
>
> **The engine is a SEPARATE service/repo on the VPS.** This repo only calls its HTTP API.
> Do **not** build, copy, or reimplement the Python engine here — it has its own CLAUDE.md
> (ships in the `patch-mockup` package). If the engine isn't deployed yet, this page can't
> work; deploying it is the engine repo's job.
>
> **How we work:** one step at a time → verify **Done when** → tick the box → next.
> `[YOU]` = human (secrets, confirmations). `[CC]` = Claude Code (writes/edits code).

---

## 0. What this adds

A new left-sidebar item **"Patch Generator"** → a standalone page where a sales agent
uploads artwork, picks one of the automated services from a dropdown, and gets back a
**realistic, producible mockup** (with size dimensions + warnings). The agent can
**download** it and **optionally attach** it to a quote/order. Everything else —
unsupported types, manual fixes — stays exactly as it is today.

---

## 1. Scope

- **Standalone page.** Generate → view → **download**. **Attach to a quote/order is optional.**
- **Dropdown = the automated services only** (the agreed set — see §7). Manual-only types
  are not offered here.
- **Synchronous.** The page calls the VPS, waits a few seconds, shows the result. One
  generation at a time (a single agent clicking Generate), so **no queue is needed.**
- **NOT in scope now:** auto-triggering on quote upload, the RQ queue, Supabase Edge
  Functions, callbacks, Realtime. Those belong to the future "wire into the quote form"
  step — see §12. Don't build them for this.

---

## 2. Hard rules

1. **Additive only.** Do not modify other CRM pages, tables, RLS, or flows. New route,
   new sidebar item, one new serverless proxy — nothing else changes.
2. **The engine lives on the VPS.** This repo calls its API. Never reimplement it here.
3. **The VPS API key NEVER reaches the browser.** It lives in a Vercel serverless function
   env and is added server-side — the exact pattern your repo already uses in
   `api/sentry-proxy.ts`. The browser calls the proxy, never the VPS directly.
4. **The mockup is a producible representation, NOT pixel-exact.** Always show the warnings
   banner. (Pixel-exact only comes from the post-sale digitized file — out of scope.)
5. **Reuse what exists:** auth (`ProtectedRoute`), the Supabase client, UI components,
   Tailwind styling, TanStack Query, and your existing file-attach mechanism.

---

## 3. How it fits the existing CRM

- Stack unchanged: React 18 + TS + Vite + Supabase + Vercel.
- Add a route `/patch-generator` behind `ProtectedRoute`, and a sidebar entry (near
  "Payment Forms" fits the grouping).
- Use TanStack Query for the request state; reuse your Storage client only if you build
  the optional attach (§9).

---

## 4. The engine (external — on the VPS)

- Base URL: `https://api.pandapatches.com` (deployed by the engine repo).
- Endpoint used: **`POST /mockup`** — takes artwork + patch_type + params, returns the
  mockup JSON **synchronously**. Bearer-auth with `DIGITIZE_API_KEY`.
- Prerequisite: `GET https://api.pandapatches.com/health` must return `{ "ok": true }`.
  If it doesn't, the engine isn't deployed yet — this page is blocked until it is.

---

## 5. API contract

**Request** the proxy sends the VPS — `multipart/form-data`:
`file`, `patch_type`, `width_mm`, `border_mm`, `base_hex`, `border_hex`
Header: `Authorization: Bearer <DIGITIZE_API_KEY>`

**Response** (JSON, returned straight back to the browser):
```json
{
  "png_base64": "…",
  "svg": "<svg>…</svg> | null",
  "mockup_style": "embroidery",
  "production_file": "dst",
  "category": "embroidery",
  "colors": [ { "code": "T-063", "name": "Navy", "hex": "#152A55" } ],
  "warnings": [ "3D puff supports 2 colours max…" ],
  "size_mm": [80, 70],
  "render_source": "fal-flux | local | local-fallback"
}
```

---

## 6. The Vercel proxy + the key ([CC] + [YOU])

- **[CC]** Add a serverless function `api/mockup-proxy.ts` that forwards the browser's
  request to `${DIGITIZE_SERVICE_URL}/mockup`, injecting
  `Authorization: Bearer ${DIGITIZE_API_KEY}`, and returns the VPS JSON.
  - Forward the incoming `multipart/form-data` body + `content-type` straight through
    (disable Vercel body parsing / stream the body). Keep it thin — mirror
    `api/sentry-proxy.ts`.
- **[YOU]** Vercel env vars:
  - `DIGITIZE_SERVICE_URL = https://api.pandapatches.com`
  - `DIGITIZE_API_KEY = <secret>` (the same value set on the VPS — generate with
    `openssl rand -hex 32`).
- The browser calls **`/api/mockup-proxy`** (same-origin) — never the VPS, never the key.

**Done when:** a `curl` to your deployed `/api/mockup-proxy` with a test image returns a
mockup JSON, and the key never appears in any client bundle or network request.

---

## 7. The services dropdown ([YOU] confirm the list)

Show only the **automated services**. Keep a small config in the page — an array of
`{ value, label }` matching the engine's `patch_type` strings — and confirm the exact set
with the team. Each maps to an output the page should communicate:

| Service (dropdown) | Output the agent gets |
|--------------------|-----------------------|
| Embroidery | mockup (final file hand-digitized after the sale) |
| 3D Puff | mockup (hand-digitized; **max 2 colours**, bold only) |
| PVC | mockup + **SVG** |
| Silicone | mockup + **SVG** |
| Woven | mockup + **SVG** |
| Printed | mockup |
| Leather | mockup + **SVG** |
| Chenille | mockup only (specialist makes the file) |
| Sequin | mockup only (specialist makes the file) |

- [ ] **[YOU]** Confirm the exact **8** (or however many) that go in the dropdown, and the
      exact label + `patch_type` string each should send.
- The engine's `categories.json` is the authority on limits/outputs; the dropdown just
  needs to send the right `patch_type`. (Optionally, later, fetch `categories.json` from
  the engine so the list stays in sync — not required now.)

---

## 8. The page — components & behaviour ([CC])

- **Upload** area (drag-drop + click), image types.
- **Service dropdown** (§7), plus **width (in/mm)**, **border**, and optional **base colour**.
- **Generate** button → POST to `/api/mockup-proxy` (multipart) → loading state.
- **Result:** show the returned mockup image (it already includes the grid + size
  dimensions), the **colour chips**, and a **yellow warnings banner** when `warnings[]` is
  non-empty ("Heads up — set expectations with the customer: …").
- **Download** button (save the PNG; and the SVG when present).
- **Attach to…** button → optional (§9).
- Clear **error** and **empty** states. No concurrency handling needed (standalone, one at a time).

**Done when:** on the live CRM, an agent uploads a logo, picks a service, clicks Generate,
sees the mockup + colours + any warnings, and downloads it.

---

## 9. Optional "Attach to quote/order" ([CC])

- After generation, **Attach to…** → search/select a quote or order → upload the mockup
  PNG (decode `png_base64`) to your **existing Storage bucket** → link it via your
  **existing file-attach mechanism**. No schema change (attach as a normal file).
- [ ] **[YOU]** Confirm the Storage **bucket name** and the **attach method** the CRM
      already uses for order/quote files.

**Done when:** a generated mockup appears as an attachment on the chosen quote/order.

---

## 10. What YOU provide (summary)

- [ ] `DIGITIZE_API_KEY` — `openssl rand -hex 32`; set on the **VPS** and as a **Vercel** env.
- [ ] `DIGITIZE_SERVICE_URL = https://api.pandapatches.com` — Vercel env.
- [ ] The exact **service list** for the dropdown (§7).
- [ ] Storage **bucket name** + **attach method** (only if building §9).
- [ ] *(Engine repo, separate)* engine **deployed** and healthy; real **Candle thread
      chart** loaded; **production sign-off** on limits.

---

## 11. Build plan (this repo)

### Phase 0 — Engine is live
- [ ] **[YOU]** Confirm `GET https://api.pandapatches.com/health` returns ok (engine repo work).
- **Done when:** health check passes.

### Phase 1 — Proxy
- [ ] **[CC]** `api/mockup-proxy.ts` forwarding to the VPS with the bearer key.
- [ ] **[YOU]** Set `DIGITIZE_SERVICE_URL` + `DIGITIZE_API_KEY` in Vercel.
- **Done when:** a curl through `/api/mockup-proxy` returns a mockup; key never client-side.

### Phase 2 — The page
- [ ] **[CC]** Route `/patch-generator` + sidebar entry.
- [ ] **[CC]** Upload + service dropdown + size/border inputs + Generate → proxy call.
- [ ] **[CC]** Result display: mockup image, colour chips, warnings banner, Download.
- **Done when:** an agent generates and downloads a mockup on the live CRM.

### Phase 3 — Optional attach
- [ ] **[CC]** Attach-to-quote/order using the existing bucket + attach mechanism.
- **Done when:** a generated mockup lands on a chosen record.

### Phase 4 — Better looks (no work here)
- The FLUX photoreal upgrade happens **engine-side** (set `FAL_KEY` on the VPS). Mockups
  from this page automatically look better once that's on — nothing changes in this repo.

---

## 12. Future (NOT now): auto-trigger on quote upload

If you later want the mockup to generate **automatically** when artwork is uploaded to a
quote (no agent clicking Generate), that's the "Both" option: it adds the **RQ queue** on
the VPS + two **Edge Functions** (`request-mockup`, `mockup-callback`) + **Realtime**
updates. It's fully specced in the **engine repo's `MOCKUP-ENGINE-SPEC.md`**. Do not build
it for the standalone page — revisit only if/when you want hands-free generation.

---

## 13. Known caveats

- **Not pixel-exact.** Mockups are producible representations (thread-colour quantized,
  fine detail dropped, colours capped) — keep the warnings visible.
- **Colours accurate only once the real Candle chart is in the engine** (engine-side).
- **Engine must be deployed first** — the page is useless without a healthy VPS API.

---

## 14. Cost

No new cost in this repo. Engine costs (VPS ~$5–12/mo; fal.ai ~$0.03/megapixel, optional)
are engine-side. Vercel Pro you already have.

---

## 15. Glossary

- **Mockup** — the realistic PNG the customer approves; constrained to producible detail.
- **Proxy** — `api/mockup-proxy.ts`, the Vercel function that adds the API key server-side.
- **Engine** — the Python mockup service on the VPS (separate repo). This page calls it.
- **render_source** — `fal-flux` (FLUX finish) | `local` | `local-fallback`, returned per mockup.
- **DST / EMB** — machine/editable embroidery files. Out of scope — digitizer makes them by hand after the sale.
