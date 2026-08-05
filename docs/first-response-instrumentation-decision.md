# First-Response Time — Decision Document (for the owner)

**Status:** decision requested — this is a scoping/cost document, **not** a build order.
**Date:** 2026-08-02 · **Context:** CL59AC §3 ("we reply in minutes" claim)

---

## The decision you're being asked to make

Do we invest in **instrumenting genuine first-response time** so the "we reply in
minutes" claim becomes provable — or ship the new conversation path **without** the claim
for now? Three options are laid out at the bottom. Nothing gets built until you pick one.

## Background — what happened

The website release wanted to publish "we reply in minutes" **with its receipts in the
same release** (correct discipline — no claim without proof). When we went to pull the
proof from the CRM, the only response-time signal available (`quotes.email_sent_at`)
returned a **median and p90 of 0 minutes**. That's not a real number — it means the quote
email is **sent automatically the instant a quote is created**, so the timestamp measures
the software, not a person replying. There is currently **no clean measurement of how fast
a human actually responds** to an inbound inquiry.

## The honest note (please read this first)

**This is not a correction of an overclaim.** The brief states Panda already replies in
~1–5 minutes, and that is very likely true — the sales team is genuinely fast. We are
**not** saying the claim is false. We are saying it is currently **unprovable from our
data**. Nobody inflated anything; we simply have no receipts yet. Instrumenting this
converts an **invisible strength into a provable one.**

## Why it's worth considering (the value)

- **Research value is real:** responses under ~5 minutes are associated with roughly a
  **2.6× higher close rate**. If ops is genuinely replying in 1–5 minutes, that is a
  material competitive advantage we currently can't show a customer, a partner, or
  ourselves.
- **It's not just a marketing line:** this gives the CRM a **real operational metric** — a
  response-time SLA the owner can actually manage against (spot slow weeks, staffing gaps,
  channel blind spots), independent of whether it ever appears on the website.

## Why it's a project, not a quick fix

True first-response time = **(customer's first inbound touch) → (first *human* reply)**.
Our system captures neither of those cleanly today. Three parts, across three systems:

| Part | What's needed | Where it lives | Difficulty |
|---|---|---|---|
| **1. Inbound first-touch time** | The real moment the inquiry arrives, per channel | Website form · **email inbox** · **Meta chat** | Web: easy · Email/Meta: hard |
| **2. First *human* reply time** | When a person first replies — separated from the automated quote-email send | CRM + each reply channel | Medium |
| **3. Metric + monitor** | Median/p90 in staffed hours, weekly report line, auto-flag if median >15 min for 2 weeks | CRM (once 1 & 2 exist) | Easy |

**What drives the cost:** the website channel is *almost* already captured (a web quote's
`created_at` ≈ the customer's submit time). The expensive parts are **email intake** (needs
an email-ingestion pipeline to timestamp inbound mail) and **Meta chat** (needs Meta API/
webhook access to timestamp first message) — plus reliably distinguishing a **human** reply
from the automated send in Part 2. Those external integrations, not the metric itself, are
the real spend.

## Options

**Option A — Full cross-system instrumentation (web + email + Meta).**
Provable response time across every channel a customer can reach us. Highest cost; depends
on Meta API access and an email-ingestion pipeline. This is the "fully defensible
everywhere" version.

**Option B — Web-quote channel only (phased Phase 1). ← recommended if you want the claim.**
Instrument just the website quote flow (the largest channel and the cheapest): first-touch
= the web form submit time we already have, plus a new "first human reply" timestamp
stamped when staff first takes a real action on the quote (not the auto-send). This
substantiates the claim **for web quote requests** — honestly scoped as such — without the
email/Meta integration cost. Email + Meta can be added later as Phase 2 if the number
proves valuable. Small-to-medium build, no external dependencies.

**Option C — Don't build; ship without the claim. ← current default.**
The new conversation path (the highest-value part of the brief) ships as-is; we simply omit
"we reply in minutes." Zero cost, zero risk. Revisit if/when responsiveness becomes a
priority worth proving.

## Recommendation

- **If the responsiveness claim matters to the marketing story → Option B.** It's the
  cheapest path to a *defensible* number, gives ops a real SLA metric, and can grow into
  Option A later. Scope it, cost it, then decide.
- **If it's a nice-to-have → Option C for now.** Ship the conversation path; park the claim.
  Nothing is lost that can't be added later.

Either way: **do not publish "reply in minutes" until Option A or B is actually in place** —
the number has to exist before the claim does.
