// src/utils/customerSegment.ts
// B2B / B2C segmentation + company ("account") grouping by email domain.
//
// Industry-standard heuristic: a FREE email provider (gmail/yahoo/icloud…) = individual (B2C);
// a CUSTOM domain = business / agency (B2B). Orders from the same domain belong to the same
// COMPANY account — the B2B "Accounts + Contacts" model — even across different contact emails
// (e.g. amanda@fundthenations.com + bubba@fundthenations.com are one reseller account).
//
// Caveat: the domain heuristic UNDERcounts B2B (small resellers using gmail won't group). A manual
// override could be layered on later; this is the standard first-pass signal every CRM uses.

export const FREE_EMAIL_DOMAINS = new Set<string>([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com', 'gmx.us', 'mail.com',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'yandex.com', 'zoho.com',
  'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net', 'bellsouth.net',
  'charter.net', 'frontier.com', 'earthlink.net', 'optonline.net', 'juno.com', 'aim.com',
]);

export type CustomerSegment = 'Business' | 'Personal';

export function getEmailDomain(email?: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

/** Business (B2B) when the domain is a custom company domain; Personal (B2C) for free providers. */
export function classifySegment(email?: string | null): CustomerSegment {
  const domain = getEmailDomain(email);
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return 'Personal';
  return 'Business';
}

/** "fundthenations.com" -> "Fundthenations" (best-effort display name from the domain root). */
export function companyNameFromDomain(domain: string): string {
  if (!domain) return '—';
  const root = domain.split('.')[0].replace(/[-_]/g, ' ');
  return root.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface OrderLike {
  customer_email?: string | null;
  customer_name?: string | null;
  order_amount?: number | null;
  created_at?: string | null;
  order_number?: string | null;
}

export interface CompanyAccount {
  domain: string;
  company: string;
  orders: number;
  contacts: number;          // distinct buyer emails under this company
  contactNames: string[];
  revenue: number;
  avgOrder: number;
  firstOrder: string;        // ISO
  lastOrder: string;         // ISO
  daysSinceLast: number;
  orderNumbers: string[];    // all order #s under this account (for "view orders")
}

/** Group every BUSINESS-domain order into company accounts (one row per company domain). */
export function buildCompanyAccounts(orders: OrderLike[], nowMs: number = Date.now()): CompanyAccount[] {
  const map = new Map<string, {
    revenue: number; orders: number; emails: Set<string>; names: Set<string>; first: number; last: number; nums: string[];
  }>();

  for (const o of orders) {
    if (classifySegment(o.customer_email) !== 'Business') continue;
    const domain = getEmailDomain(o.customer_email);
    if (!domain) continue;
    const amt = Number(o.order_amount) || 0;
    const t = o.created_at ? new Date(o.created_at).getTime() : nowMs;
    let acc = map.get(domain);
    if (!acc) { acc = { revenue: 0, orders: 0, emails: new Set(), names: new Set(), first: t, last: t, nums: [] }; map.set(domain, acc); }
    acc.revenue += amt;
    acc.orders += 1;
    if (o.order_number) acc.nums.push(o.order_number);
    if (o.customer_email) acc.emails.add(o.customer_email.toLowerCase());
    if (o.customer_name && o.customer_name.trim()) acc.names.add(o.customer_name.trim());
    acc.first = Math.min(acc.first, t);
    acc.last = Math.max(acc.last, t);
  }

  const out: CompanyAccount[] = [];
  for (const [domain, a] of map.entries()) {
    out.push({
      domain,
      company: companyNameFromDomain(domain),
      orders: a.orders,
      contacts: a.emails.size,
      contactNames: Array.from(a.names),
      revenue: Math.round(a.revenue),
      avgOrder: Math.round(a.revenue / Math.max(a.orders, 1)),
      firstOrder: new Date(a.first).toISOString(),
      lastOrder: new Date(a.last).toISOString(),
      daysSinceLast: Math.floor((nowMs - a.last) / 86_400_000),
      orderNumbers: a.nums,
    });
  }
  return out;
}

/** Group PERSONAL-segment (B2C) orders by individual email — one row per customer.
 *  Returned in the same shape as CompanyAccount so the same table can render both:
 *  here `company` = the person's name and `domain` = their email. */
export function buildPersonalCustomers(orders: OrderLike[], nowMs: number = Date.now()): CompanyAccount[] {
  const map = new Map<string, { revenue: number; orders: number; name: string; first: number; last: number; nums: string[] }>();
  for (const o of orders) {
    if (classifySegment(o.customer_email) !== 'Personal') continue;
    const email = (o.customer_email || '').trim().toLowerCase();
    if (!email) continue;
    const amt = Number(o.order_amount) || 0;
    const t = o.created_at ? new Date(o.created_at).getTime() : nowMs;
    let acc = map.get(email);
    if (!acc) { acc = { revenue: 0, orders: 0, name: (o.customer_name || '').trim() || email, first: t, last: t, nums: [] }; map.set(email, acc); }
    acc.revenue += amt;
    acc.orders += 1;
    if (o.order_number) acc.nums.push(o.order_number);
    if (o.customer_name && o.customer_name.trim()) acc.name = o.customer_name.trim();
    acc.first = Math.min(acc.first, t);
    acc.last = Math.max(acc.last, t);
  }
  const out: CompanyAccount[] = [];
  for (const [email, a] of map.entries()) {
    out.push({
      domain: email,
      company: a.name,
      orders: a.orders,
      contacts: 1,
      contactNames: [a.name],
      revenue: Math.round(a.revenue),
      avgOrder: Math.round(a.revenue / Math.max(a.orders, 1)),
      firstOrder: new Date(a.first).toISOString(),
      lastOrder: new Date(a.last).toISOString(),
      daysSinceLast: Math.floor((nowMs - a.last) / 86_400_000),
      orderNumbers: a.nums,
    });
  }
  return out;
}

export interface MonthlySegment {
  label: string;     // "Jun 26"
  sort: number;
  b2bRevenue: number; b2bOrders: number;
  b2cRevenue: number; b2cOrders: number;
}

/** Monthly B2B vs B2C breakdown (revenue + order counts), oldest→newest. */
export function buildMonthlySegments(orders: OrderLike[], months = 6): MonthlySegment[] {
  const map = new Map<string, MonthlySegment>();
  for (const o of orders) {
    if (!o.created_at) continue;
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let row = map.get(key);
    if (!row) {
      row = {
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        sort: d.getFullYear() * 12 + d.getMonth(),
        b2bRevenue: 0, b2bOrders: 0, b2cRevenue: 0, b2cOrders: 0,
      };
      map.set(key, row);
    }
    const amt = Number(o.order_amount) || 0;
    if (classifySegment(o.customer_email) === 'Business') { row.b2bRevenue += amt; row.b2bOrders += 1; }
    else { row.b2cRevenue += amt; row.b2cOrders += 1; }
  }
  return Array.from(map.values()).sort((a, b) => a.sort - b.sort).slice(-months);
}
