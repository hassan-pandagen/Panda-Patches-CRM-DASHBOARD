// src/utils/roleAccess.ts
// Single source of truth for what each ROLE may do.
//
// ── Why this file exists (Task 0.1 of the digitizer-portal brief) ────────────
// `role` gates access independently of the eleven permission flags, at ~67 call
// sites. Most are positive (`role === ADMIN`) and therefore default-deny: a role
// that did not exist when the check was written simply fails it.
//
// A handful were written NEGATIVELY, and those are the problem:
//
//     canSendEmail = role !== 'PRODUCTION' && role !== 'SHIPPING'
//
// A brand-new role fails both tests, so the expression is TRUE. Adding
// `DIGITIZER` as configuration would therefore GRANT outside freelancers the
// ability to email customers directly — plus Activity, Inbox and New Order,
// all gated the same way. Silently, on day one, and in exactly the opposite
// direction to the intent.
//
// Every capability below is an explicit allowlist. A role not named in one does
// not get it. Adding a role is now additive-by-omission: it gets nothing until
// someone deliberately writes it into a list here.
//
// ── Invariant ───────────────────────────────────────────────────────────────
// These lists reproduce the EXACT behaviour of the negative checks they
// replaced, for the four roles that existed when they were written. This file
// changes no one's access today; it only changes what happens when a fifth role
// appears.
//
// When adding a role (Task 1.1), walk this file top to bottom and decide each
// list explicitly. For DIGITIZER the answer is "no" to nearly all of them.

import { UserRole } from '../types/index';

/**
 * Send customer-facing email from the order page.
 * Was: `role !== 'PRODUCTION' && role !== 'SHIPPING'` (EmailLogsSection).
 * ⚠️ The single most important list here — an outside digitizer must never
 * appear in it, or the blind-vendor model is void.
 */
export const ROLES_CAN_SEND_CUSTOMER_EMAIL: UserRole[] = [
  UserRole.ADMIN,
  UserRole.SALES_AGENT,
  // Task 1.6: the supervisor sends the mockup; a sales agent may when needed.
  UserRole.PRODUCTION_SUPERVISOR,
  // DIGITIZER is deliberately absent and must stay absent — it is the structural
  // half of Guardrail 1. With no send path, a digitizer has no route to a customer
  // at all, rather than relying on fields being hidden.
];

/**
 * See the "New Order" entry point.
 * Was: `role !== UserRole.PRODUCTION` (Navbar).
 */
export const ROLES_CAN_CREATE_ORDERS: UserRole[] = [
  UserRole.ADMIN,
  UserRole.SALES_AGENT,
  UserRole.SHIPPING,
  // Not DIGITIZER (brief: never Create Orders). Not PRODUCTION_SUPERVISOR — the
  // supervisor assigns and runs work; orders originate from sales or checkout.
];

/**
 * See the Activity feed and the Inbox.
 * Was: `!isProduction && !isShipping` (Sidebar).
 * Both surfaces carry customer identity and conversation content.
 */
export const ROLES_CAN_VIEW_ACTIVITY_AND_INBOX: UserRole[] = [
  UserRole.ADMIN,
  UserRole.SALES_AGENT,
  // Not DIGITIZER — the Inbox is the customer conversation. Not
  // PRODUCTION_SUPERVISOR either: the brief gives them assignment, QC and
  // completion, not customer correspondence.
];

/**
 * See EVERY order row, rather than being scoped to their own.
 * Was: `userRole !== ADMIN && !== PRODUCTION && !== SHIPPING` → scope to own
 * (AllOrdersPage, twice).
 *
 * Note the scoping this replaces matches on `orders.sales_agent = <email>`.
 * That is a sales-agent idiom; a role with no sales-agent rows is scoped to
 * nothing, which is the safe direction but is NOT a substitute for a real
 * per-role scope (see Task 1.2's `assigned_digitizer_id`).
 */
export const ROLES_SEE_ALL_ORDER_ROWS: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRODUCTION,
  UserRole.SHIPPING,
  // PRODUCTION_SUPERVISOR carries View All Orders per the brief.
  UserRole.PRODUCTION_SUPERVISOR,
  // DIGITIZER absent: scoped to assigned work only, via digitizer_assignments
  // and the window rule (Task 1.2) — NOT via this list.
];

/**
 * See unscoped dashboard figures rather than their own.
 * Was: `role !== UserRole.ADMIN` (Dashboard).
 */
export const ROLES_SEE_ALL_DASHBOARD_DATA: UserRole[] = [UserRole.ADMIN];

/**
 * See unscoped report figures rather than their own.
 * Was: `role !== ADMIN && role !== PRODUCTION` (ReportsPage).
 */
export const ROLES_SEE_ALL_REPORT_DATA: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRODUCTION,
  UserRole.PRODUCTION_SUPERVISOR,
  // DIGITIZER absent — reports aggregate across all orders.
];

/**
 * See WHO the customer is: name, email, phone, shipping address, and lead source.
 *
 * PROJECT-KNOWLEDGE §5.1 already states the rule — production must never see
 * "amounts, deposits, balances, profit, costs, lead source, or any financial
 * figure", and their view should be "design name, patch type, backing, size,
 * quantity, instructions, attachments, status". Only the financial half was
 * actually enforced.
 *
 * Why a ROLE gate and not a permission: email/phone/address were gated on
 * `shipping_view`, and BOTH Production accounts hold that flag — so production
 * could read the customer's name, email, phone, address and lead source. The
 * boundary being drawn here is a role boundary (production makes patches, sales
 * handles the customer), so it belongs on the role.
 *
 * SHIPPING stays in: they need the name and address to dispatch.
 * PRODUCTION_SUPERVISOR stays in: they send mockups to customers (Task 1.6).
 * DIGITIZER is out for the same reason as PRODUCTION, and Guardrail 1.
 */
export const ROLES_CAN_VIEW_CUSTOMER_IDENTITY: UserRole[] = [
  UserRole.ADMIN,
  UserRole.SALES_AGENT,
  UserRole.SHIPPING,
  UserRole.PRODUCTION_SUPERVISOR,
];

/**
 * Reach the admin-only routes (AdminRoute).
 * Was: `role !== UserRole.ADMIN` → redirect. Already deny-shaped and therefore
 * safe, but expressed positively so the whole file reads one way.
 */
/**
 * Record the matched yarn on a colour-match order (chenille letter packages).
 * The brief names the supervisor as the one who fills it; ADMIN keeps the
 * override every other production control gives them.
 *
 * Not a security boundary — the real gate is the database trigger
 * guard_colour_match_before_production, which blocks IN_PRODUCTION for everyone
 * including service_role. This list only decides who is shown the control.
 */
export const ROLES_CAN_CONFIRM_COLOUR_MATCH: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRODUCTION_SUPERVISOR,
];

/**
 * Dispatch digitizing work (Task 1.4). Mirrors the server-side check inside
 * assign_digitizer() — the RPC refuses anyone else, so this list only decides who is
 * shown the panel. DIGITIZER is absent on purpose: they receive work, never hand it out.
 */
export const ROLES_CAN_ASSIGN_DIGITIZER: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRODUCTION_SUPERVISOR,
];

/** See the digitizer queue/route at all. Admins keep it for support and testing. */
export const ROLES_CAN_USE_DIGITIZER_PORTAL: UserRole[] = [
  UserRole.ADMIN,
  UserRole.DIGITIZER,
];

export const ROLES_CAN_ACCESS_ADMIN_ROUTES: UserRole[] = [UserRole.ADMIN];

/**
 * Reach user management. Note the call site also accepts the `users_manage`
 * permission flag, so this list is the role half of an OR, not the whole gate.
 */
export const ROLES_CAN_MANAGE_USERS: UserRole[] = [UserRole.ADMIN];

/**
 * Default-deny membership test.
 *
 * Takes the raw role off the session, which is typed `UserRole | null` but is a
 * free-text column underneath — so an unrecognised or null value must land on
 * `false` rather than throwing or coercing. That is the whole point of the file.
 */
/**
 * Does the caller hold ANY of the allowed roles?
 *
 * Accepts a single role or the full set, because an account can now hold several
 * (CEO decision 6 Sept: Zahid is DIGITIZER + PRODUCTION_SUPERVISOR). Multi-role is a
 * UNION of capabilities — it can only ever grant, never restrict.
 *
 * ⚠️ That union is the hazard worth naming: a DIGITIZER handed a second role silently
 * loses the blind-vendor protection Guardrail 1 rests on. Nothing here can detect that;
 * the account screen has to make DIGITIZER + anything a deliberate, warned choice.
 *
 * Still default-deny: no roles, an empty set, or an unknown role all return false.
 */
export const roleCan = (
  role: UserRole | string | null | undefined | readonly (UserRole | string)[],
  allowed: UserRole[],
): boolean => {
  if (!role) return false;
  const held = Array.isArray(role) ? role : [role];
  const allow = allowed as string[];
  return held.some(r => !!r && allow.includes(r as string));
};

/**
 * Highest-privilege role in a set — mirrors the SQL primary_role() that keeps
 * user_profiles.role in sync. Kept in step with it deliberately: the 34 call sites that
 * still compare `role` directly must see the same answer the database derived.
 *
 * DIGITIZER is last on purpose. Someone who is a digitizer AND something else must never
 * present as a digitizer to code that special-cases production or the blind-vendor view.
 */
const ROLE_PRECEDENCE: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRODUCTION_SUPERVISOR,
  UserRole.SALES_AGENT,
  UserRole.SHIPPING,
  UserRole.PRODUCTION,
  UserRole.DIGITIZER,
];

export const primaryRole = (roles: readonly (UserRole | string)[] | null | undefined): UserRole | null => {
  if (!roles || roles.length === 0) return null;
  for (const r of ROLE_PRECEDENCE) if (roles.includes(r)) return r;
  return null;   // only unknown values -> nothing, which is default-deny
};

/**
 * Roles that must not be combined with DIGITIZER without the admin being warned.
 * Multi-role is a UNION, so any second role hands an outside freelancer capabilities the
 * blind-vendor model says they must never have. This does not block the combination —
 * Zahid legitimately holds it — it only makes the UI say so out loud.
 */
export const isRiskyRoleCombination = (roles: readonly (UserRole | string)[]): boolean =>
  roles.includes(UserRole.DIGITIZER) && roles.length > 1;

/**
 * Holds DIGITIZER and nothing else — an outside freelancer rather than staff covering
 * two jobs. Mirrors is_digitizer_only() in SQL, which narrows their storage access.
 *
 * Used to HIDE staff navigation from them. Not a security boundary: the database gives a
 * digitizer no path to orders or quotes at all, so the pages would be empty anyway. This
 * just avoids showing an outside contractor a set of doors that all open onto nothing.
 */
export const isDigitizerOnly = (roles: readonly (UserRole | string)[] | null | undefined): boolean =>
  !!roles && roles.length === 1 && roles[0] === UserRole.DIGITIZER;
