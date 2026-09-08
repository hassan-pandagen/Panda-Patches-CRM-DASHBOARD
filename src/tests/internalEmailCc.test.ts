// Who gets copied on internal mail.
//
// The Production Supervisor is CC'd from one place — the send-email edge function — because
// five different senders build their own cc strings and an address maintained by hand across
// five lists gets missed on the sixth. That makes the routing rule in that one function load-
// bearing, so it is pinned here.
//
// The failure this guards against is not a crash. It is an email quietly going to the wrong
// person: a customer-facing template picking up an internal gmail address in its CC header,
// or a financial template reaching production. Neither shows up in a type check and neither
// throws — the mail just sends, to the wrong list.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../../supabase/functions/send-email/index.ts'),
  'utf-8'
);

// Mirror of ccProductionSupervisor() in that file. The assertion below fails if the real one
// is edited without updating this copy, so the two cannot drift apart silently.
const NO_PRODUCTION_CC = new Set(['INTERNAL_PAYMENT_NOTIFICATION']);
function ccProductionSupervisor(templateId: string): boolean {
  if (NO_PRODUCTION_CC.has(templateId)) return false;
  return templateId.startsWith('INTERNAL') || templateId === 'PRODUCTION_TEAM_REVISION';
}

describe('Production Supervisor CC on internal email', () => {
  it('the edge function still implements the rule this file mirrors', () => {
    expect(SOURCE).toContain(
      "return templateId.startsWith('INTERNAL') || templateId === 'PRODUCTION_TEAM_REVISION';"
    );
    expect(SOURCE).toContain("'INTERNAL_PAYMENT_NOTIFICATION',");
    expect(SOURCE).toContain("const PRODUCTION_SUPERVISOR_CC = 'pandaproduction.office@gmail.com';");
    // And it is actually applied, not merely defined.
    expect(SOURCE).toContain('ccProductionSupervisor(template_id)');
  });

  it('copies him on the internal production workflow', () => {
    for (const id of [
      'INTERNAL_NEW_ORDER',
      'INTERNAL_START_PRODUCTION',
      'INTERNAL_PRODUCTION_COMPLETE',
      'INTERNAL_REMAKE',
      'INTERNAL_COLOUR_MATCH_FOLLOWUP',
      'PRODUCTION_TEAM_REVISION',   // [INTERNAL] subject, id predates the prefix convention
    ]) {
      expect(ccProductionSupervisor(id), id).toBe(true);
    }
  });

  it('keeps him off payment mail — production never sees amounts', () => {
    // This template renders Total / Amount Paid / Remaining Balance and the customer's email.
    expect(ccProductionSupervisor('INTERNAL_PAYMENT_NOTIFICATION')).toBe(false);
  });

  it('never copies him on a customer-facing template', () => {
    for (const id of [
      'CUSTOMER_NEW_ORDER',
      'CUSTOMER_MOCKUP_READY',
      'CUSTOMER_SHIPPED',
      'CUSTOMER_DELIVERED',
      'CUSTOMER_PAYMENT_CONFIRMATION',
      'CUSTOMER_PAYMENT_LINK',
      'CUSTOMER_REVIEW_INVITE',
      'CUSTOMER_NEW_AGENT_MESSAGE',
      'WEBSITE_AUTH_PASSWORD_RESET',
      'LOYALTY_BRONZE_AWARDED',
      // Subject-tagged "[INTERNAL] QA Check", but orderService sends it to the CUSTOMER.
      // A templateId.includes('INTERNAL') test would have leaked a gmail address into the
      // CC header of a customer's inbox — which is why the real rule matches on prefix.
      'QUALITY_ASSURANCE',
    ]) {
      expect(ccProductionSupervisor(id), id).toBe(false);
    }
  });

  it('picks up internal templates added later without anyone remembering to', () => {
    expect(ccProductionSupervisor('INTERNAL_SOME_FUTURE_STEP')).toBe(true);
  });
});
