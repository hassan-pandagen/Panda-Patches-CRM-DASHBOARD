// src/services/digitizerService.ts
// Everything the digitizer portal talks to. All of it goes through RPCs rather than
// table reads, because the access rules live in the database (Phase 1, Tasks 1.2–1.5).
//
// A digitizer has NO row-level policy on `orders` or `quotes`. They cannot select from
// those tables at all — get_digitizer_queue / get_digitizer_item are the entire surface,
// and both list their columns by hand. That is what makes Guardrail 1 structural: a
// customer field cannot reach a freelancer through a column the function never reads.

import { supabase } from './supabaseClient';
import { logger } from './logger';

export interface DigitizerQueueItem {
  assignment_id: number;
  kind: 'order' | 'quote';
  reference: string;
  design_name: string | null;
  patches_type: string | null;
  design_size: string | null;
  patches_quantity: number | null;
  state: string;
  is_urgent: boolean;
  due_at: string | null;
  assigned_at: string;
}

export interface DigitizerItemDetail extends DigitizerQueueItem {
  design_backing: string | null;
  border_type: string | null;
  instructions: string | null;
  change_request: string | null;
  customer_reference_urls: string[] | null;
  mockup_urls: string[] | null;
  production_file_urls: string[] | null;
  /** True while the item sits with the customer — visible, but no uploads (Task 1.5). */
  read_only: boolean;
  /** Where this digitizer may upload. Comes from the same function the storage policy
   *  checks, so the path and the permission cannot drift apart. */
  storage_prefix: string;
}

export const getDigitizerQueue = async (): Promise<DigitizerQueueItem[]> => {
  const { data, error } = await supabase.rpc('get_digitizer_queue');
  if (error) throw error;
  return (data ?? []) as DigitizerQueueItem[];
};

export const getDigitizerItem = async (assignmentId: number): Promise<DigitizerItemDetail | null> => {
  const { data, error } = await supabase.rpc('get_digitizer_item', { p_assignment_id: assignmentId });
  if (error) throw error;
  const rows = (data ?? []) as DigitizerItemDetail[];
  // Empty is the correct answer for an item that has left the window — the digitizer is
  // told it moved on, not shown a stale copy. Revocation is next-fetch, not next-login.
  return rows[0] ?? null;
};

/** Active digitizer accounts, for the supervisor's assignment picker. */
export const getActiveDigitizers = async (): Promise<{ id: string; full_name: string; email: string }[]> => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .contains('roles', ['DIGITIZER'])
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return data ?? [];
};

/**
 * Assign (or reassign) an item. The RPC releases any existing live assignment in the same
 * statement, so the previous digitizer's access ends at the same instant the new one's
 * begins — there is no window where both, or neither, can see it.
 */
export const assignDigitizer = async (args: {
  orderId?: number | null;
  quoteId?: number | null;
  digitizerId: string;
  dueAt?: string | null;
}): Promise<number> => {
  const { data, error } = await supabase.rpc('assign_digitizer', {
    p_order_id: args.orderId ?? null,
    p_quote_id: args.quoteId ?? null,
    p_digitizer_id: args.digitizerId,
    p_due_at: args.dueAt ?? null,
  });
  if (error) {
    logger.error('[Digitizer] assign failed', error);
    throw error;
  }
  return data as number;
};

/** Who is currently assigned, for the supervisor panel. Digitizers never call this. */
export const getLiveAssignment = async (args: { orderId?: number; quoteId?: number }) => {
  let q = supabase
    .from('digitizer_assignments')
    .select('id, digitizer_id, assigned_at, due_at')
    .is('released_at', null)
    .limit(1);
  q = args.orderId ? q.eq('order_id', args.orderId) : q.eq('quote_id', args.quoteId!);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0] ?? null;
};

export interface ResolvedThreadColour {
  code: string;
  name: string | null;
  hex_approx: string | null;
  matched_via: 'code' | 'floor-confirmed alias';
}

/**
 * Does the customer's typed colour resolve to a stock thread code?
 *
 * EXACT matches only — a code, or a name the floor has explicitly confirmed as an alias.
 * No fuzzy matching by design: a wrong match here skips the customer confirmation on a
 * $150 set, which is the failure the colour gate exists to prevent. "PMS 10014",
 * "10014 blue" and "royal blue" all resolve to nothing and take the ask-the-customer path.
 */
export const resolveThreadColour = async (input: string | null | undefined):
  Promise<ResolvedThreadColour | null> => {
  if (!input || !input.trim()) return null;
  const { data, error } = await supabase.rpc('resolve_thread_code', { p_input: input });
  if (error) return null;              // degrade to "ask the customer", never to "assume"
  return ((data ?? []) as ResolvedThreadColour[])[0] ?? null;
};
