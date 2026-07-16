// src/services/customerFlagsService.ts
// "Premium customer" tagging — lets sales/admin flag a customer so production knows to apply
// extra QA/QC. Keyed by email (normalized lower/trim), not customer_profiles, so it works for
// every customer regardless of portal-account status. No financial data ever lives here —
// production must only ever see the flag itself, never why.
import { supabase } from './supabaseClient';
import { logger } from './logger';

const normEmail = (email: string) => email.trim().toLowerCase();

export interface CustomerFlag {
  isPremium: boolean;
  setBy: string | null;
  setAt: string | null;
}

/** Batch lookup for list views (e.g. the Orders list) — one query per page of rows. */
export const getPremiumEmailsSet = async (emails: string[]): Promise<Set<string>> => {
  const normalized = Array.from(new Set(emails.filter(Boolean).map(normEmail)));
  if (normalized.length === 0) return new Set();

  const { data, error } = await supabase
    .from('customer_flags')
    .select('customer_email')
    .eq('is_premium', true)
    .in('customer_email', normalized);

  if (error) {
    logger.error('[customerFlagsService] getPremiumEmailsSet failed', error);
    return new Set();
  }
  return new Set((data || []).map((row) => row.customer_email));
};

/** Single lookup for detail pages (Order detail, Customer History, New Order form). */
export const getPremiumStatus = async (email: string): Promise<CustomerFlag | null> => {
  if (!email) return null;
  const { data, error } = await supabase
    .from('customer_flags')
    .select('is_premium, set_by, set_at')
    .eq('customer_email', normEmail(email))
    .maybeSingle();

  if (error) {
    logger.error('[customerFlagsService] getPremiumStatus failed', error);
    return null;
  }
  if (!data) return { isPremium: false, setBy: null, setAt: null };
  return { isPremium: data.is_premium, setBy: data.set_by, setAt: data.set_at };
};

/** Mark/unmark a customer as Premium. Upserts so a brand-new customer can be flagged too. */
export const setPremiumStatus = async (email: string, isPremium: boolean, setByEmail: string): Promise<void> => {
  const { error } = await supabase
    .from('customer_flags')
    .upsert(
      { customer_email: normEmail(email), is_premium: isPremium, set_by: setByEmail, set_at: new Date().toISOString() },
      { onConflict: 'customer_email' }
    );

  if (error) {
    logger.error('[customerFlagsService] setPremiumStatus failed', error);
    throw error;
  }
};
