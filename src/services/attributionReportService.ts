// src/services/attributionReportService.ts
// Data fetch for the Lead Source Attribution report (CLADB5). Pulls quotes in the window +
// orders (from the window onward, so late conversions still match) and returns raw rows;
// the report component resolves "traffic" via detectLeadSource and aggregates. Order matching
// is by NORMALIZED email (lower(trim())) — the same normalization the Google Ads export uses.
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { fetchAllPaged } from '../utils/fetchAllPaged';

export interface AttrQuoteRow {
  email: string;                 // normalized (lower/trim)
  attribution: Record<string, any> | null;
  leadSource: string | null;
  instructions: string | null;   // historical heard_about lives here as "Source: X"
  createdAt: string;
  convertedOrderId: number | null;
}

export interface AttrOrderRow {
  email: string;                 // normalized
  amountPaid: number;
  status: string;
  createdAt: string;
}

const norm = (e: unknown) => String(e ?? '').toLowerCase().trim();

export async function fetchAttributionData(
  startISO: string,
  endISO: string,
): Promise<{ quotes: AttrQuoteRow[]; orders: AttrOrderRow[] }> {
  // MUST be paged. PostgREST silently caps a plain .select() at 1000 rows, and this report
  // aggregates every row it gets back — so an un-paged fetch does not fail, it just quietly
  // reports conversion rates and revenue-per-quote computed from a truncated sample. Measured
  // on live data before this fix: the 90-day default window wanted 7,331 quotes and got 1,000
  // (86% missing); the orders side wanted 1,154 and got 1,000. Every traffic-group share in
  // the report was wrong, and biased against whichever groups sort later.
  //
  // .order('id') gives fetchAllPaged a stable sort — without a deterministic order, .range()
  // paging can repeat or skip rows.
  const [quotes, orders] = await Promise.all([
    fetchAllPaged<any>((from, to) =>
      supabase
        .from('quotes')
        .select('customer_email, attribution, lead_source, instructions, created_at, converted_order_id')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('id')
        .range(from, to)
    ),
    fetchAllPaged<any>((from, to) =>
      supabase
        .from('orders')
        .select('customer_email, amount_paid, status, created_at')
        .gte('created_at', startISO)          // conversions can lag; no end cap
        .is('deleted_at', null)
        .order('id')
        .range(from, to)
    ),
  ]).catch((err) => {
    logger.error('[attributionReport] fetch failed', { error: err });
    throw err;
  });

  return {
    quotes: (quotes || []).map((q: any) => ({
      email: norm(q.customer_email),
      attribution: q.attribution ?? null,
      leadSource: q.lead_source ?? null,
      instructions: q.instructions ?? null,
      createdAt: q.created_at,
      convertedOrderId: q.converted_order_id ?? null,
    })),
    orders: (orders || []).map((o: any) => ({
      email: norm(o.customer_email),
      amountPaid: Number(o.amount_paid ?? 0),
      status: o.status,
      createdAt: o.created_at,
    })),
  };
}
