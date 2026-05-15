// supabase/functions/notify-order-message/index.ts
// Called from the frontend whenever a message is posted on an order.
//   - sender_type='customer' → notifies assigned sales_agent + all admins (bell + email)
//   - sender_type='agent'    → notifies the customer (customer_notifications + email)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  'https://login.pandapatches.com',          // customer portal
  'https://portal.pandapatches.com',          // staff CRM (production)
  'https://panda-patches-crm-dashboard.vercel.app',
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost:');
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const bodySchema = z.object({
  order_id: z.number().int().positive(),
  order_number: z.string().max(100),
  sender_type: z.enum(['customer', 'agent']),
  sender_name: z.string().max(200).optional().default('Customer'),
  content: z.string().min(1).max(5000),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Supabase env vars not configured');
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = bodySchema.parse(await req.json());
    const { order_id, order_number, sender_type, sender_name, content } = body;

    // Fetch order details for context (customer email, sales agent, etc.)
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_number, customer_email, cc_email, customer_name, sales_agent')
      .eq('id', order_id)
      .single();
    if (orderErr || !order) throw new Error(`Order ${order_id} not found`);

    const truncated = content.length > 200 ? content.substring(0, 200) + '...' : content;

    // ───────────────────────────────────────────────────────────
    // CUSTOMER → AGENT FLOW
    // ───────────────────────────────────────────────────────────
    if (sender_type === 'customer') {
      // Find recipient staff users: assigned sales_agent + all admins
      const recipients: { id: string; email: string }[] = [];

      // Look up the assigned sales agent by their email
      if (order.sales_agent) {
        const { data: agent } = await admin
          .from('user_profiles')
          .select('id, email')
          .eq('email', order.sales_agent)
          .maybeSingle();
        if (agent) recipients.push({ id: agent.id, email: agent.email });
      }

      // Add all admins
      const { data: admins } = await admin
        .from('user_profiles')
        .select('id, email')
        .eq('role', 'ADMIN');
      for (const a of admins || []) {
        if (!recipients.find(r => r.id === a.id)) {
          recipients.push({ id: a.id, email: a.email });
        }
      }

      // Insert in-CRM notifications (one per recipient)
      const notifRows = recipients.map(r => ({
        recipient_id: r.id,
        type: 'customer_message',
        title: `${sender_name} replied on order ${order_number}`,
        body: truncated,
        link: `/order/${order_number}`,
        related_order_id: order_id,
      }));
      if (notifRows.length > 0) {
        await admin.from('activity_notifications').insert(notifRows);
      }

      // Send email to each recipient via the send-email edge function
      for (const r of recipients) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
              to: r.email,
              template_id: 'AGENT_NEW_CUSTOMER_MESSAGE',
              dynamic_data: {
                customer_name: sender_name,
                order_number,
                message_content: content,
                order_link: `https://portal.pandapatches.com/order/${order_number}`,
              },
            }),
          });
        } catch (err) {
          console.warn('[notify-order-message] email to staff failed:', err);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, notified_staff: recipients.length }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ───────────────────────────────────────────────────────────
    // AGENT → CUSTOMER FLOW
    // ───────────────────────────────────────────────────────────
    if (sender_type === 'agent') {
      const customerEmails = [order.customer_email, order.cc_email].filter(
        (e): e is string => !!e
      );

      // In-portal notifications via existing customer_notifications table
      const customerNotifRows = customerEmails.map(email => ({
        customer_email: email,
        order_id: order_id,
        type: 'message',
        title: `New message on order ${order_number}`,
        body: truncated,
        is_read: false,
      }));
      if (customerNotifRows.length > 0) {
        await admin.from('customer_notifications').insert(customerNotifRows);
      }

      // Email to customer (and cc_email if set)
      for (const email of customerEmails) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
              to: email,
              template_id: 'CUSTOMER_NEW_AGENT_MESSAGE',
              dynamic_data: {
                customer_name: order.customer_name || 'Customer',
                order_number,
                message_content: content,
                order_link: `https://login.pandapatches.com/customer/order/${order_number}`,
              },
            }),
          });
        } catch (err) {
          console.warn('[notify-order-message] email to customer failed:', err);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, notified_customer: customerEmails.length }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: error.errors }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    console.error('[notify-order-message] error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
