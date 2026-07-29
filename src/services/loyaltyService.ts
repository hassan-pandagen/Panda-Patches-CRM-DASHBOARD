// src/services/loyaltyService.ts
// Staff-facing reads for the loyalty program (CL86F1). loyalty_codes is staff-SELECT via
// RLS; the per-tier Reports numbers come from the staff-gated loyalty_tier_stats() RPC.
import { supabase } from './supabaseClient';
import { logger } from './logger';

export interface LoyaltyCode {
  id: number;
  code: string;
  tier: 'bronze' | 'silver' | 'gold';
  percent: number;
  singleUse: boolean;
  expiresAt: string | null;
  status: 'active' | 'redeemed' | 'revoked';
  redeemedAt: string | null;
  redeemedOrderId: number | null;
  createdAt: string;
}

const mapCode = (r: any): LoyaltyCode => ({
  id: r.id,
  code: r.code,
  tier: r.tier,
  percent: r.percent,
  singleUse: r.single_use,
  expiresAt: r.expires_at,
  status: r.status,
  redeemedAt: r.redeemed_at,
  redeemedOrderId: r.redeemed_order_id,
  createdAt: r.created_at,
});

export const getLoyaltyCodes = async (customerId: string): Promise<LoyaltyCode[]> => {
  if (!customerId) return [];
  const { data, error } = await supabase
    .from('loyalty_codes')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('[loyaltyService] getLoyaltyCodes failed', { error });
    return [];
  }
  return (data || []).map(mapCode);
};

export interface LoyaltyTierStat {
  tier: string;
  customers: number;
  totalLifetimeValue: number;
  avgLifetimeValue: number;
  activeCodes: number;
  redeemedCodes: number;
  reorderRate: number;
}

export const getLoyaltyTierStats = async (): Promise<LoyaltyTierStat[]> => {
  const { data, error } = await supabase.rpc('loyalty_tier_stats');
  if (error) {
    logger.error('[loyaltyService] loyalty_tier_stats failed', { error });
    return [];
  }
  return (data || []).map((r: any) => ({
    tier: r.tier,
    customers: Number(r.customers ?? 0),
    totalLifetimeValue: Number(r.total_lifetime_value ?? 0),
    avgLifetimeValue: Number(r.avg_lifetime_value ?? 0),
    activeCodes: Number(r.active_codes ?? 0),
    redeemedCodes: Number(r.redeemed_codes ?? 0),
    reorderRate: Number(r.reorder_rate ?? 0),
  }));
};

// Review-generation program (MASTER v3) monthly invitations/reminders.
export interface ReviewInvitationStat {
  month: string;
  invitesSent: number;
  remindersSent: number;
}

// --- Admin override (CL86F1 Task 2.4) — ADMIN-only, enforced server-side in the RPCs ---
export const grantLoyaltyTier = async (customerId: string, tier: string, reason: string): Promise<void> => {
  const { error } = await supabase.rpc('grant_loyalty_tier', { p_customer_id: customerId, p_tier: tier, p_reason: reason });
  if (error) throw error;
};

export const revokeLoyaltyTier = async (customerId: string, reason: string): Promise<void> => {
  const { error } = await supabase.rpc('revoke_loyalty_tier', { p_customer_id: customerId, p_reason: reason });
  if (error) throw error;
};

export const reissueLoyaltyCode = async (customerId: string, tier: string, reason: string): Promise<string> => {
  const { data, error } = await supabase.rpc('reissue_loyalty_code', { p_customer_id: customerId, p_tier: tier, p_reason: reason });
  if (error) throw error;
  return data as string;
};

export const getReviewInvitationStats = async (): Promise<ReviewInvitationStat[]> => {
  const { data, error } = await supabase.rpc('review_invitation_stats');
  if (error) {
    logger.error('[loyaltyService] review_invitation_stats failed', { error });
    return [];
  }
  return (data || []).map((r: any) => ({
    month: r.month,
    invitesSent: Number(r.invites_sent ?? 0),
    remindersSent: Number(r.reminders_sent ?? 0),
  }));
};
