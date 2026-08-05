// src/services/attributionReportService.ts
// Data fetch for the Lead Source Attribution report (CLADB5). Pulls quotes in the window +
// orders (from the window onward, so late conversions still match) and returns raw rows;
// the report component resolves "traffic" via detectLeadSource and aggregates. Order matching
// is by NORMALIZED email (lower(trim())) — the same normalization the Google Ads export uses.
import { supabase } from './supabaseClient';
import { logger } from './logger';

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
  const [{ data: quotes, error: qErr }, { data: orders, error: oErr }] = await Promise.all([
    supabase
      .from('quotes')
      .select('customer_email, attribution, lead_source, instructions, created_at, converted_order_id')
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('orders')
      .select('customer_email, amount_paid, status, created_at')
      .gte('created_at', startISO)          // conversions can lag; no end cap
      .is('deleted_at', null),
  ]);

  if (qErr) { logger.error('[attributionReport] quotes fetch failed', { error: qErr }); throw qErr; }
  if (oErr) { logger.error('[attributionReport] orders fetch failed', { error: oErr }); throw oErr; }

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
