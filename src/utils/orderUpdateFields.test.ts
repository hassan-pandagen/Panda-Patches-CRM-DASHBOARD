// The production floor must never be sent money.
//
// The order-updated email exists because an order gets amended after everyone has been told
// about it ("pay $200, then take $50 more and add 10 patches"). The customer's copy shows the
// new total; the production copy must show the quantity change and nothing financial.
//
// That rule previously lived as `c.field !== 'orderAmount'` inside a switch statement, where it
// was both invisible and one careless edit from leaking. These tests are the guard.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  SPEC_FIELDS,
  PRODUCTION_NOTIFY_FIELDS,
  CUSTOMER_VISIBLE_FIELDS,
  MONEY_FIELDS,
  productionSafeChanges,
  affectsProduction,
  isCustomerVisibleField,
  FIELD_LABELS,
  type SpecChange,
} from './orderUpdateFields';

const change = (field: string, from = 'a', to = 'b'): SpecChange => ({
  field, label: FIELD_LABELS[field] ?? field, from, to,
});

describe('order-updated field rules', () => {
  it('no spec field is a money field', () => {
    // The load-bearing assertion. If someone adds a cost or balance to the spec list, this
    // fails before it can ever be emailed to the floor.
    for (const field of SPEC_FIELDS) {
      expect(MONEY_FIELDS as readonly string[], `"${field}" is money`).not.toContain(field);
    }
  });

  it('wakes production for quantity and backing only', () => {
    // CEO, 10 Sept. Narrow on purpose: an alert for a reworded instruction trains people to
    // ignore the one that says the run size doubled.
    expect(PRODUCTION_NOTIFY_FIELDS).toEqual(['patchesQuantity', 'designBacking']);
    expect(affectsProduction([change('patchesQuantity', '10', '50')])).toBe(true);
    expect(affectsProduction([change('designBacking', 'Iron-On', 'Pin Back')])).toBe(true);
    for (const quiet of ['patchesType', 'designSize', 'borderType', 'instructions', 'additionalPatchTypes']) {
      expect(affectsProduction([change(quiet)]), `${quiet} should not wake production`).toBe(false);
    }
  });

  it('still lists the quieter changes once production IS woken', () => {
    // The narrow rule is the trigger, not the contents — by then the floor is reading anyway.
    const changes = [
      change('patchesQuantity', '10', '50'),
      change('designSize', '3"', '4"'),
      change('orderAmount', '$200.00', '$250.00'),
    ];
    expect(affectsProduction(changes)).toBe(true);
    expect(productionSafeChanges(changes).map(c => c.field)).toEqual(['patchesQuantity', 'designSize']);
  });

  it('strips every money field from the production copy', () => {
    const changes = [
      change('patchesQuantity', '10', '50'),
      change('orderAmount', '$200.00', '$250.00'),
      change('amountPaid', '$200.00', '$250.00'),
      change('productionCost', '$40', '$60'),
      change('designBacking', 'Iron-On', 'Pin Back'),
    ];
    const safe = productionSafeChanges(changes);
    expect(safe.map(c => c.field)).toEqual(['patchesQuantity', 'designBacking']);
    // Belt and braces: no dollar sign survives into what production receives.
    expect(JSON.stringify(safe)).not.toContain('$');
  });

  it('the customer sees the money change, production sees nothing at all', () => {
    // A price-only amendment: real for the customer, irrelevant to the floor.
    const priceOnly = [change('orderAmount', '$200.00', '$250.00')];
    expect(isCustomerVisibleField('orderAmount')).toBe(true);
    expect(affectsProduction(priceOnly)).toBe(false);
    expect(productionSafeChanges(priceOnly)).toEqual([]);
  });


  it('ignores fields nobody needs telling about', () => {
    // Editing an internal cost or a tracking number is not an amendment to the order.
    for (const field of ['productionCost', 'shippingTrackingNumber', 'salesAgent', 'leadSource']) {
      expect(isCustomerVisibleField(field), field).toBe(false);
    }
  });

  it('every customer-visible field has a human label', () => {
    // An email reading "patchesQuantity: 10 → 50" is the kind of thing that ships unnoticed.
    for (const field of CUSTOMER_VISIBLE_FIELDS) {
      expect(FIELD_LABELS[field], `no label for "${field}"`).toBeTruthy();
      expect(FIELD_LABELS[field]).not.toBe(field);
    }
  });

  it('the send path still routes both copies through these rules', () => {
    const svc = readFileSync(resolve(__dirname, '../services/orderService.ts'), 'utf-8');
    expect(svc).toContain('productionSafeChanges(allChanges)');
    expect(svc).toContain('affectsProduction(specChanges)');
    // And the customer copy is the only one that carries totals.
    expect(svc).toContain('CUSTOMER_ORDER_UPDATED');
    expect(svc).toContain('INTERNAL_ORDER_UPDATED');
  });
});
