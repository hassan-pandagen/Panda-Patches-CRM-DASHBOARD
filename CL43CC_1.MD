# Claude Code Brief: pre-payment mockup requests + digitizer dispatch (Sept 2026)

Why: many customers ask for the mockup BEFORE paying. Today that's handled
ad hoc. This makes it a first-class CRM step on quotes, with the two
notification emails and digitizer routing built in. Scope note (CEO):
digitizing is where the load is — this ships now; production-vendor
routing (PVC etc.) is explicitly deferred, don't build for it.

## 1. The feature — "Mockup requested" on quotes

Two entry points:
1. **On any existing quote**: a "Request mockup" action/button.
2. **Manual creation**: agents can create a mockup request directly (for
   customers who came via chat/email/phone and have no quote form entry) —
   minimal fields: customer name, email, patch type, size, qty if known,
   artwork upload, notes.

State on the quote record: `MOCKUP_REQUESTED → MOCKUP_IN_PROGRESS →
MOCKUP_SENT`. When the mockup is sent, the existing Lead CAPI event
already fires at AWAITING_APPROVAL — confirm this flow reuses that path
rather than creating a parallel one (no duplicate Lead events).

## 2. Two emails on trigger

1. **Customer** (from the standard transactional sender): "We're preparing
   your free mockup" — set the expectation from canon: ready in 12–24
   hours, unlimited revisions, no payment needed until you approve. Include
   quote reference (canonical PP number rules apply).
2. **Internal** (to the existing internal notification list): "Mockup
   required — [PP-xxxxx / customer / type / size / qty]" with a direct link
   to the quote and the artwork.

## 3. Digitizer dispatch option

On the mockup request (and reusable later for paid orders), a "Send to
digitizer" option with a vendor picker:

| Vendor | Email | Default |
|---|---|---|
| Lil Customerz Design (current) | lilcustomerzdesign@gmail.com | ✅ pre-ticked |
| Hammad | HammadHa46@gmail.com | selectable |

- Vendor email is **blind** per the earlier routing decision: artwork,
  patch type, size, colors, deadline, our reference number — **no customer
  name, email, or contact info**.
- Reply-to: our internal address, not the customer.
- Log the dispatch on the quote (who sent, which vendor, when) so agents
  can see a digitizing request is already out.
- Store the two digitizers in a small table/config (name, email, active),
  not hard-coded — cheap to do now, and adding one later is a row, not a
  deploy. But do NOT build production-vendor routing, checklists, or
  ship-back flows — that whole feature is deferred.

## 4. Guardrails / assumptions (pre-ticked, correct me if wrong)

1. Customer email sender = existing transactional address (not billing@ —
   that's invoices only).
2. Free-mockup-before-payment is already our public promise (12–24h on the
   site), so no approval gate — any agent can trigger it.
3. Digitizer dispatch is optional per request, not automatic — agent
   decides (some mockups don't need digitizing).
4. "Convert to Order" from a mockup-approved quote must keep working
   unchanged (attribution preservation — the button flow).

## Acceptance

1. Demo: quote → Request mockup → both emails received (paste copies);
   manual-creation path demoed with an artwork upload.
2. Dispatch to each vendor: email received, verified blind (screenshot),
   reply-to correct, logged on the quote.
3. Lead event fires once (not twice) when the mockup is sent — Events
   Manager check.
4. Vendor table editable without deploy (or documented how to add one).
5. Deploy confirmed finished before verification.
