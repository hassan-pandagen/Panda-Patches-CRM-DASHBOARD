// Which order edits count as "this order is no longer what we told people it was", and which
// of those the production floor is allowed to see.
//
// Lives in its own module so the money rule is testable. It used to be a filter buried in a
// switch statement inside triggerStatusEmail, where nothing could check it and a future edit
// could quietly widen it.
//
// The rule: production NEVER sees amounts, deposits or balances. An order-updated email to the
// floor may say the quantity went from 10 to 50; it may never say the total went from $200 to
// $250. That is a standing constraint across the whole CRM, not a preference.

/** Every non-money field that describes what is being made. */
export const SPEC_FIELDS = [
  'patchesQuantity',
  'patchesType',
  'additionalPatchTypes',
  'designSize',
  'designBacking',
  'borderType',
  'instructions',
] as const;

/**
 * What actually WAKES the floor. Deliberately just two (CEO, 10 Sept): "production just needs
 * to know if any backing or quantity has changed".
 *
 * Narrow on purpose. Production emails are only useful if they mean something — an alert for a
 * reworded instruction or a border tweak trains people to ignore the ones that say the run size
 * doubled. Quantity and backing are the two that change what physically gets made and how much
 * of it.
 *
 * This is the TRIGGER, not the contents: when one of these fires, the email still lists every
 * other non-money change alongside it, because by then the floor is reading anyway.
 */
export const PRODUCTION_NOTIFY_FIELDS = ['patchesQuantity', 'designBacking'] as const;

/** Everything the CUSTOMER should be told about — the specs, plus what they're paying. */
export const CUSTOMER_VISIBLE_FIELDS = [...SPEC_FIELDS, 'orderAmount'] as const;

/** Fields that carry money and must never reach a production-facing email. */
export const MONEY_FIELDS = ['orderAmount', 'amountPaid', 'amountRemaining', 'productionCost',
  'shippingCost', 'marketingCost', 'depositAmount', 'balanceDue'] as const;

export const FIELD_LABELS: Record<string, string> = {
  patchesQuantity: 'Quantity',
  patchesType: 'Patch Type',
  additionalPatchTypes: 'Additional Patch Types',
  designSize: 'Size',
  designBacking: 'Backing',
  borderType: 'Border Type',
  instructions: 'Special Instructions',
  orderAmount: 'Order Total',
};

export type SpecChange = { field: string; label: string; from: string; to: string };

export const isCustomerVisibleField = (field: string): boolean =>
  (CUSTOMER_VISIBLE_FIELDS as readonly string[]).includes(field);

/** True when a change is one the floor is woken for — quantity or backing. */
export const affectsProduction = (changes: readonly SpecChange[]): boolean =>
  changes.some(c => (PRODUCTION_NOTIFY_FIELDS as readonly string[]).includes(c.field));

/**
 * Strip anything the floor must not see. Filters on a money DENY-list rather than a spec
 * allow-list on purpose: if someone adds a new money field and forgets to think about this,
 * the deny-list still has to be updated for it to leak, and the test below fails first.
 */
export const productionSafeChanges = (changes: readonly SpecChange[]): SpecChange[] =>
  changes.filter(c => !(MONEY_FIELDS as readonly string[]).includes(c.field));
