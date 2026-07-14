# Patch Generator — Progress & Handoff

> Standalone CRM page where an agent uploads artwork, picks an automated service, and gets
> back a realistic **producible** mockup (grid + size arrows + colour chips + warnings) to
> download and send the customer. Calls the VPS mockup engine via a server-side proxy.
> Spec: `CLAUDE.md`. Engine: `patch-mockup/` (its own `CLAUDE.md` + `categories.json`).
>
> **Scope of this build = MVP:** upload → generate → download. **No** DB changes, **no**
> edge functions, **no** attach-to-quote/order (that's a later phase).

---

## 📍 CURRENT STATUS (2026-07 session)

- **CRM side: DONE + pushed** — commit `9082cd9 "new patch mockup generator"`. Page + proxy
  are in the repo; Vercel should have deployed them.
- **Vercel env vars:** `DIGITIZE_SERVICE_URL=https://api.pandapatches.com` +
  `DIGITIZE_API_KEY` (exact names, no `VITE_` prefix) — **confirm these are saved in the CRM
  Vercel project.**
- **DNS: DONE** — `api.pandapatches.com → 93.127.132.136` (A record at Namecheap, verified
  worldwide).
- **Engine: deployed on the VPS, Windows-native (NOT Docker).** Runs as NSSM service
  **`PandaMockup`** (auto-start), listening on **`127.0.0.1:8001`** (port 8000 was taken by
  another app), key-enforcement ON. Verified locally (`/health`→ok, `/mockup` 401 w/o Bearer,
  200 with). Source lives at `C:\Users\Administrator\Desktop\patch-mockup` on the VPS.
- **⛔ BLOCKER 1 — VPS expired**, needs renewal/payment. On renewal the `PandaMockup` service
  should auto-start.
- **⛔ BLOCKER 2 — the last real task: the reverse-proxy route.** The VPS already runs
  **Traefik** on ports 80/443 (fronting other apps) — it serves "TRAEFIK DEFAULT CERT" and
  returns **404** for our domain (404 = no route; a down engine would be 502). **Caddy is
  abandoned** (can't bind 80/443). Fix = add a **Traefik file-provider route**:
  `Host(api.pandapatches.com) → http://127.0.0.1:8001`, TLS via Traefik's existing ACME
  resolver (mirror how the other apps on the box get their certs).

**To finish (when VPS is back):** (1) confirm `PandaMockup` running + `127.0.0.1:8001/health`
ok → (2) add the Traefik route → (3) verify `https://api.pandapatches.com/health` = `{"ok":true}`
with a valid cert → (4) test the CRM `/patch-generator` page end-to-end.

---

## ✅ DONE — CRM side (built + typechecks; committed & pushed in `9082cd9`)

- [x] **Proxy:** `api/mockup-proxy.ts` — forwards the browser's `multipart/form-data` to the
      VPS `POST /mockup`, injecting `Authorization: Bearer <DIGITIZE_API_KEY>` server-side.
      Key never reaches the browser. (Defensive body handling — works whether Vercel streams
      or pre-buffers the multipart body.)
- [x] **Services config:** `src/constants/patchGeneratorServices.ts` — the **9** automated
      services, each mapped to the engine `categories.json` key it must send
      (`embroidery`, `puff_3d`, `pvc`, `silicone`, `woven`, `printed`, `leather`,
      `chenille`, `sequin`).
- [x] **Page:** `src/pages/PatchGeneratorPage.tsx` — drag/drop upload, service dropdown,
      width (in) / border (mm) / base colour, **Generate**, result = mockup image + size +
      colour chips + **yellow warnings banner**, **Download PNG** (and SVG when present).
      Loading / error / empty states included.
- [x] **Route:** `/patch-generator` in `src/App.tsx` (lazy, behind `ProtectedRoute`).
- [x] **Sidebar:** entry in `src/components/layout/Sidebar.tsx`, gated to **ADMIN +
      SALES_AGENT** (production/shipping don't see it).
- [x] `npm run typecheck` passes.

**Note:** the page is fully built but **cannot generate anything until the VPS engine is
live** — until then, Generate shows a clear "Could not reach the mockup engine" error.

---

## ⏳ REMAINING

### 1. Commit + push (planned: tomorrow)
- [ ] Decide **branch vs main** for the commit.
- [ ] Push → Vercel auto-deploys the page + proxy.
- Files to include: `api/mockup-proxy.ts`, `src/constants/patchGeneratorServices.ts`,
  `src/pages/PatchGeneratorPage.tsx`, `src/App.tsx`, `src/components/layout/Sidebar.tsx`.
  (This commit can also carry the other pending work from this session — production-completion
  feature, patch-type additions, `super-handler` rename — decide scope at commit time.)

### 2. Vercel env vars (~2 min)
Project → Settings → Environment Variables:
- [ ] `DIGITIZE_SERVICE_URL = https://api.pandapatches.com`
- [ ] `DIGITIZE_API_KEY = <the key generated in chat>`  ⚠️ **secret — do NOT put it in this file or git.**

### 3. VPS engine deploy — Phase 1 (the main remaining work)
Engine already has all scaffolding: `patch-mockup/Dockerfile`, `docker-compose.yml`,
`Caddyfile`, `deploy.sh`, `.env.example`.
- [ ] VPS ready (IP + SSH access) — ~4 GB.
- [ ] DNS: `api.pandapatches.com` → VPS IP.
- [ ] Install Docker + docker compose on the VPS; open ports 80/443; add ~2 GB swap.
- [ ] VPS `.env`: `DIGITIZE_API_KEY` = **the same value** set in Vercel (+ optional `FAL_KEY` later).
- [ ] `docker compose up -d --build` (Caddy handles TLS automatically).
- [ ] **Done when:** `curl https://api.pandapatches.com/health` → `{"ok":true}` over HTTPS.

### 4. End-to-end test (~10 min, after 1–3)
- [ ] On the live CRM `/patch-generator`: upload a logo → pick Embroidery → Generate →
      see mockup + colours + any warnings → Download PNG. Repeat for PVC (expect an SVG too).

### 5. Later phases (NOT now)
- [ ] **Real Candle thread chart** → accurate colours (engine-side `threads.json`; data
      dependency — colours are approximate until this is in).
- [ ] **fal FLUX finish** for photoreal looks (esp. leather/chenille/sequin) → set `FAL_KEY`
      on the VPS. Nothing changes in this repo.
- [ ] **Attach mockup to a quote/order** (CRM follow-up — needs bucket + attach-field confirm).
- [ ] Optionally add **Chenille TPU** + **Chenille Glitter** to the dropdown (2 more engine
      categories; render as the chenille look).

---

## ⏱️ Time estimate (honest)
- **If the VPS already exists with Docker installed + DNS pointed:** ~**30–45 min**
  (Vercel vars + push + `docker compose up` + TLS cert + one test).
- **If provisioning the VPS from scratch** (no server/DNS yet): **+1–2 hrs**, plus DNS
  propagation wait.
- **Caveats:** the multipart proxy can't be verified until live (possible small debug loop);
  colours aren't final until the Candle chart is loaded.

---

## Open decisions
- Commit to **branch or main**?
- Dropdown: keep **9** or add TPU/Glitter chenille → **11**?
- When to build the **attach-to-quote/order** phase.

## Security
`DIGITIZE_API_KEY` is a secret: set it in **Vercel env** and the **VPS `.env`** (same value),
never in git. If it ever leaks, regenerate (`openssl rand -hex 32`) and update **both** places.
