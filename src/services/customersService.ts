// src/services/customersService.ts
// Customer Accounts — the master record for a real person (portal login or guest
// checkout), independent of customer_profiles (which requires an auth.users row and so
// can't represent guest-checkout customers). Keyed by normalized (lower/trim) email.
// See claude-code-task-customer-accounts.md for the feature spec.
import { supabase } from './supabaseClient';
import { logger } from './logger';

const normEmail = (email: string) => email.trim().toLowerCase();

export interface Customer {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  defaultShippingAddress: string | null;
  country: string | null;
  companyName: string | null;
  notes: string | null;
  customerProfileId: string | null;
  isActive: boolean;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  // Loyalty program (CL86F1)
  loyaltyTier: 'none' | 'bronze' | 'silver' | 'gold';
  lifetimePaidValue: number;
}

export interface CustomerWithOrders extends Customer {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  portalLastLoginAt: string | null;
}

const mapDbToCustomer = (row: any): Customer => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  phone: row.phone,
  defaultShippingAddress: row.default_shipping_address,
  country: row.country,
  companyName: row.company_name,
  notes: row.notes,
  customerProfileId: row.customer_profile_id,
  isActive: row.is_active,
  mergedIntoId: row.merged_into_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  loyaltyTier: row.loyalty_tier ?? 'none',
  lifetimePaidValue: Number(row.lifetime_paid_value ?? 0),
});

/**
 * Fetch a customer by id, following a merged-away record to its survivor (one hop — merges
 * always point at an is_active=true record) so an old /portal-customers/:id link still resolves.
 */
export const getCustomerById = async (id: string): Promise<Customer | null> => {
  if (!id) return null;
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
  if (error) {
    logger.error('[customersService] getCustomerById failed', error);
    return null;
  }
  if (!data) return null;
  if (data.merged_into_id) {
    const { data: survivor, error: survivorError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', data.merged_into_id)
      .maybeSingle();
    if (survivorError) {
      logger.error('[customersService] getCustomerById survivor lookup failed', survivorError);
      return mapDbToCustomer(data);
    }
    return survivor ? mapDbToCustomer(survivor) : mapDbToCustomer(data);
  }
  return mapDbToCustomer(data);
};

/** Single lookup by email — used for the OrderPage cross-link and OrderForm collision checks. */
export const getCustomerByEmail = async (email: string): Promise<Customer | null> => {
  if (!email) return null;
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('normalized_email', normEmail(email))
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    logger.error('[customersService] getCustomerByEmail failed', error);
    return null;
  }
  return data ? mapDbToCustomer(data) : null;
};

/** Search for CustomersPage's search box — name/email/company, active accounts only. */
export const searchCustomers = async (query: string): Promise<Customer[]> => {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)
    .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,company_name.ilike.%${q}%`)
    .limit(50);
  if (error) {
    logger.error('[customersService] searchCustomers failed', error);
    return [];
  }
  return (data || []).map(mapDbToCustomer);
};

export interface CustomersPageParams {
  page: number;
  pageSize: number;
  search?: string;
  loyaltyTier?: string; // 'all' | 'none' | 'bronze' | 'silver' | 'gold'
}

export interface CustomersPageResult {
  customers: CustomerWithOrders[];
  totalCount: number;
}

/**
 * Paginated customer list + order stats, for CustomersPage. Only fetches orders belonging
 * to the customers on THIS page (not the whole orders table) — order stats are matched by
 * normalized email client-side, scoped to the current page's emails.
 */
export const listCustomersPage = async ({ page, pageSize, search = '', loyaltyTier = 'all' }: CustomersPageParams): Promise<CustomersPageResult> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  const q = search.trim();
  if (q) {
    query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%,company_name.ilike.%${q}%`);
  }

  if (loyaltyTier && loyaltyTier !== 'all') {
    query = query.eq('loyalty_tier', loyaltyTier);
  }

  const { data: customerRows, count, error } = await query;
  if (error) {
    logger.error('[customersService] listCustomersPage failed', error);
    throw error;
  }
  if (!customerRows?.length) return { customers: [], totalCount: count || 0 };

  const emails = customerRows.map((r: any) => r.email).filter(Boolean);

  const [{ data: orders }, { data: loginTimes }] = await Promise.all([
    emails.length
      ? supabase.from('orders').select('customer_email, order_amount, created_at').in('customer_email', emails)
      : Promise.resolve({ data: [] as any[] }),
    supabase.rpc('get_customer_last_login_times'),
  ]);

  const loginMap = new Map<string, string | null>();
  (loginTimes || []).forEach((row: any) => {
    loginMap.set(row.customer_id, row.last_sign_in_at);
  });

  const orderStatsByEmail = new Map<string, { orderCount: number; totalSpent: number; lastOrderAt: string | null }>();
  (orders || []).forEach((o: any) => {
    if (!o.customer_email) return;
    const key = normEmail(o.customer_email);
    const existing = orderStatsByEmail.get(key) || { orderCount: 0, totalSpent: 0, lastOrderAt: null as string | null };
    existing.orderCount += 1;
    existing.totalSpent += o.order_amount || 0;
    if (!existing.lastOrderAt || new Date(o.created_at).getTime() > new Date(existing.lastOrderAt).getTime()) {
      existing.lastOrderAt = o.created_at;
    }
    orderStatsByEmail.set(key, existing);
  });

  const customers = customerRows.map((row: any) => {
    const stats = orderStatsByEmail.get(normEmail(row.email)) || { orderCount: 0, totalSpent: 0, lastOrderAt: null };
    return {
      ...mapDbToCustomer(row),
      orderCount: stats.orderCount,
      totalSpent: stats.totalSpent,
      lastOrderAt: stats.lastOrderAt,
      portalLastLoginAt: row.customer_profile_id ? loginMap.get(row.customer_profile_id) ?? null : null,
    };
  });

  return { customers, totalCount: count || 0 };
};

export interface CustomerStatsSummary {
  totalCustomers: number;
  portalActive: number;
  neverLoggedIn: number;
  totalRevenue: number;
}

/**
 * Lightweight global stats for the CustomersPage tiles — decoupled from pagination so
 * turning pages doesn't refetch these. Portal-active/never-logged-in only scans
 * customer_profiles + the login RPC (not orders); total revenue is the one query that still
 * has to touch every order, but only a single skinny column, not full rows.
 */
export const getCustomerStatsSummary = async (): Promise<CustomerStatsSummary> => {
  const [{ count: totalCustomers }, { data: profiles }, { data: loginTimes }, { data: orderAmounts }] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('customers').select('customer_profile_id').eq('is_active', true).not('customer_profile_id', 'is', null),
    supabase.rpc('get_customer_last_login_times'),
    supabase.from('orders').select('order_amount'),
  ]);

  const loginMap = new Map<string, string | null>();
  (loginTimes || []).forEach((row: any) => loginMap.set(row.customer_id, row.last_sign_in_at));

  let portalActive = 0;
  (profiles || []).forEach((row: any) => {
    if (loginMap.get(row.customer_profile_id)) portalActive += 1;
  });

  const totalRevenue = (orderAmounts || []).reduce((sum: number, o: any) => sum + (o.order_amount || 0), 0);

  return {
    totalCustomers: totalCustomers || 0,
    portalActive,
    neverLoggedIn: (totalCustomers || 0) - portalActive,
    totalRevenue,
  };
};

/** Plain update — no optimistic locking, matches customer_flags' weight, not orders' audit-diff machinery. */
export const updateCustomer = async (
  id: string,
  patch: Partial<Pick<Customer, 'email' | 'fullName' | 'phone' | 'defaultShippingAddress' | 'country' | 'companyName' | 'notes'>>,
  updatedByEmail: string
): Promise<void> => {
  const dbPatch: Record<string, any> = { updated_by: updatedByEmail };
  if (patch.email !== undefined) dbPatch.email = patch.email;
  if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone;
  if (patch.defaultShippingAddress !== undefined) dbPatch.default_shipping_address = patch.defaultShippingAddress;
  if (patch.country !== undefined) dbPatch.country = patch.country;
  if (patch.companyName !== undefined) dbPatch.company_name = patch.companyName;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;

  const { error } = await supabase.from('customers').update(dbPatch).eq('id', id);
  if (error) {
    logger.error('[customersService] updateCustomer failed', error);
    throw error;
  }
};

/** Create a new account — for a future manual "create account" flow / OrderForm prefill (Phase 7). */
export const createCustomer = async (
  input: Pick<Customer, 'email' | 'fullName' | 'phone' | 'defaultShippingAddress' | 'country' | 'companyName'>,
  createdByEmail: string
): Promise<Customer> => {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      email: input.email,
      full_name: input.fullName,
      phone: input.phone,
      default_shipping_address: input.defaultShippingAddress,
      country: input.country,
      company_name: input.companyName,
      created_by: createdByEmail,
    })
    .select('*')
    .single();

  if (error) {
    logger.error('[customersService] createCustomer failed', error);
    throw error;
  }
  return mapDbToCustomer(data);
};
