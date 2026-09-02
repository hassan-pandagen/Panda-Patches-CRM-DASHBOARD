# Panda Patches CRM — roles & permissions audit

**Date:** 2 Sept 2026
**System:** Panda Patches OS V2.5
**Read from:** `/user-management`, live portal
**Method:** observed in the UI. Permission counts beyond the first three come
from "+N more" badges, so exact tails are inferred from counts, not read.

---

## 1. How the model actually works

Two independent layers, and this is the thing to understand before changing
anything:

- **Role** — a label: `SALES_AGENT`, `PRODUCTION`, `SHIPPING`, `ADMIN`
- **Permissions** — eleven independent flags, granted per user
- **Presets** — five one-click bundles: Sales, Production, Shipping, Clock
  Only, Admin

**The role does not grant anything.** It is a display label. Access comes
entirely from the eleven flags, which are set per user and can drift from the
role's preset the moment anyone edits them by hand.

That's a reasonable architecture — it's flexible, and it means the new roles in
the production-workflow brief are configuration, not engineering. It also means
role names in this system are not a security boundary, and reading the role
column tells you nothing reliable about what someone can see.

### The eleven permissions

```
Manage Users · Create Orders · View All Orders · View Own Orders Only ·
Change Status · Edit Financials · Edit Production · Delete Orders ·
View Reports · View Shipping · Clock Only
```

**`View Own Orders Only` already exists.** The scoping primitive the digitizer
design needs is built and shipping. It is simply not applied to the accounts
that most need it.

---

## 2. Current state — twelve accounts

| Account | Name | Role | Permissions (first 3 + count) |
|---|---|---|---|
| `shabbybukhari@gmail.com` | Shabbar | ADMIN | Manage Users, Create Orders, Delete Orders **+7 = 10** |
| `danishpandapatches@gmail.com` | Danish | ADMIN | Manage Users, Create Orders, Delete Orders **+6 = 9** |
| `lance@pandapatches.com` | Imran | ADMIN | Manage Users, Create Orders, Delete Orders **+6 = 9** |
| `hello@pandapatches.com` | Panda Super Admin | ADMIN | Manage Users, Create Orders, Delete Orders **+6 = 9** |
| `furqanali91400@gmail.com` | Furqan | Sales Agent | Create Orders, View Shipping, Change Status **+4 = 7** |
| `manzoor.majeed@gmail.com` | Manzoor | Sales Agent | Create Orders, View Shipping, **View All Orders** **+4 = 7** |
| `7mehhhdi7@gmail.com` | Mehdi | Sales Agent | Create Orders, View Shipping, Change Status **+4 = 7** |
| `shuja1706@gmail.com` | Shuja | Sales Agent | Create Orders, View Shipping, Change Status **+4 = 7** |
| `hassanjamal5004@gmail.com` | Hassan Jamal | Sales Agent | Create Orders, View Shipping, Change Status **= 3** |
| `haseebghaffar009@gmail.com` | Haseeb Ghaffar | Shipping | View Shipping, View All Orders, Change Status **= 3** |
| `lilcustomize550@gmail.com` | Saad | Production | View Shipping, View All Orders, Edit Production **= 3** |
| `lilcustomerzdesign@gmail.com` | Zahid Bhai | Production | View Shipping, View All Orders, Edit Production **= 3** |

---

## 3. Findings

### 3.1 Production accounts hold View All Orders — P0

Both Production accounts are your digitizing vendors. `lilcustomerzdesign@gmail.com`
is Lil Customerz Design, named in the mockup-before-payment brief as a vendor who
must receive **blind** emails with no customer information.

They can currently open any order and read customer name, email, phone and full
shipping address — plus, on orders where financial visibility isn't separately
gated, order value.

`View Own Orders Only` exists and is exactly the fix. It is not applied here.

**This is a configuration change, not a build.** Whether to make it is your call
— these may be long-trusted partners — but the current setting is a default
nobody chose, and it contradicts a brief you approved.

### 3.2 Shabbar has more access than the CEO

Shabbar holds 10 of 11 permissions. You hold 9. So does Danish and the shared
super-admin account.

Probably harmless and probably historical. But worth ten seconds to confirm it's
deliberate, because the one extra permission is invisible in the table and the
account can also create and delete users.

### 3.3 Sales Agent permissions have drifted

The role is applied inconsistently:

- Furqan, Mehdi, Shuja: 7 permissions each, including Change Status
- **Manzoor: 7, but with View All Orders instead** — a different grant to the
  same role
- **Hassan Jamal: 3** — less than half of what his peers have

Manzoor is the account currently doing bulk status updates in the activity feed,
so the extra grant is probably intentional. Hassan's thin set may be why he shows
**0 active orders** while Danish carries 94 — if he can't do what the others do,
routing work to him doesn't help.

The presets exist precisely to prevent this drift. They aren't being used
consistently.

### 3.4 Shared account with full admin

`hello@pandapatches.com` — "Panda Super Admin", 9 permissions including Manage
Users and Delete Orders. A role account, so credentials are presumably shared,
and its actions in the audit trail attribute to nobody in particular. It already
appears in PP-11399's history approving an urgent flag.

For an account that can delete orders and create users, that's worth tightening
— named accounts, and drop the shared one to something narrower.

### 3.5 Two Gmail-based vendor accounts, no offboarding path

Both digitizer accounts are personal Gmail addresses belonging to an outside
firm. That's normal for contractors and fine — provided deactivation is one
action. "Delete User" exists. Whether it also cuts their access to the
**public storage bucket** is answered in the workflow brief: it does not,
because that bucket needs no authentication at all.

---

## 4. Recommendations

Ordered by ratio of risk removed to effort.

### Now — configuration only, no code

1. **Swap Production accounts to `View Own Orders Only`.** Removes the standing
   exposure of your whole order book to an outside vendor. Reversible in one
   click if it breaks their workflow.
2. **Confirm Shabbar's extra permission** is intentional.
3. **Normalise Sales Agents to one preset.** Decide whether Change Status or
   View All Orders is the standard, apply it to all five, and grant exceptions
   deliberately rather than by drift.
4. **Bring Hassan Jamal up to the Sales Agent standard.** He's at zero active
   orders while others carry 60–94; permissions may be part of why.

### Next — small build

5. **Add `Digitizer` and `Production Supervisor` roles.** Since roles are just
   labels over the same eleven flags, this is a schema enum addition plus two
   new presets, not a permissions rewrite.
6. **Split the current Production role.** Zahid and Saad become Digitizers
   (scoped, no customer data). Whoever supervises the floor becomes Production
   Supervisor. See §5.
7. **Make presets authoritative.** Show a "modified from preset" marker on any
   user whose flags no longer match their role's preset. Drift is invisible
   today, which is why §3.3 happened.

### Structural — worth deciding on before the CRM grows further

8. **Retire the shared `hello@` admin account** in favour of named accounts.
9. **The private-bucket fix from the workflow brief.** Until it lands, every
   permission change above is partial — the files are readable without any
   account at all.

---

## 5. Proposed role definitions

Assumes the eleven existing flags, no new permission types.

| Role | Permissions | Notes |
|---|---|---|
| **Digitizer** | View Own Orders Only, Edit Production, Clock Only | No customer data, no financials, no status changes beyond submit |
| **Production Supervisor** | View All Orders, Change Status, Edit Production, View Shipping, Clock Only | Assigns work, runs QC, marks complete. No financials, no user management |
| **Sales Agent** (normalised) | Create Orders, View Own Orders Only, Change Status, View Shipping, Clock Only | Pick one standard and apply it to all five |
| **Shipping** (unchanged) | View Shipping, View All Orders, Change Status | Works as intended |

Digitizer needs one thing the current flags don't cleanly express: submit a
mockup without holding general Change Status. Either add a narrow
`Submit Mockup` flag, or let `Edit Production` cover it and gate the specific
transition server-side. The second is less work and less new surface.

---

## 6. Questions I need answered to go further

1. **Who is the production supervisor?** No current account looks like one.
   Saad and Zahid are the digitizing vendor. Is the supervisor an existing
   person, or a new hire?
2. **Who makes mockups today?** On PP-11399 the mockup files were uploaded and
   the status moved by **Shuja, a Sales Agent** — not by either Production
   account. If sales agents are producing mockups, the workflow brief's
   assumption is wrong and the digitizer role changes shape.
3. **What do Zahid and Saad actually do in the portal now?** They hold
   Edit Production. Are they digitizing, running the floor, or both?
4. **Is Danish's 94 active orders real, or inflated by the 31 stuck orders?**
   The load-balancing recommendation depends on the answer.
5. **Should digitizers see order value?** Currently they can. The proposed
   Digitizer role removes it.
6. **Who receives "ready to ship"?** Haseeb is the only Shipping account.
