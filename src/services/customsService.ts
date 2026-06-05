// src/services/customsService.ts
// Pure, on-demand resolver for commercial-invoice / customs data.
// Given an Order, derives HTS code, material composition, MID, origin, etc.
// from the patch type + backing + destination country. No DB, no side effects.

import { Order } from '../types';
import {
  CUSTOMS_CONSTANTS,
  CUSTOMS_CATEGORIES,
  PATCH_TYPE_CATEGORY,
  BACKING_WORDING,
  DEFAULT_BACKING_WORDING,
} from '../constants/customs';

export interface CustomsData {
  // Constant fields
  manufacturerName: string;
  manufacturerAddress: string;
  countryOfOrigin: string;
  isoCountryCode: string;
  midCode: string;
  reasonForExport: string;
  incoterms: string;

  // Derived per patch type
  htsCode: string | null;        // truncated to 6-digit HS for non-US destinations
  htsCodeFull: string | null;    // full code before any international truncation
  htsAlt: string | null;         // alternate code for ambiguous categories
  material: string | null;
  materialAlt: string | null;

  // Line-item context
  quantity: number;
  unitValueUsd: number | null;   // the only field expected to be entered manually
  totalValueUsd: number | null;

  // Flags
  isShippable: boolean;          // false for DST service / sample boxes
  needsConfirmation: boolean;    // ambiguous category or composite/coin/keychain
  confirmationNote: string | null;
  isInternational: boolean;      // destination ≠ USA
  countryMissing: boolean;       // no country set → can't decide US-vs-international truncation
}

// Truncate a US 10-digit HTS (e.g. "5810.92.1000") to its 6-digit HS heading ("5810.92")
function toSixDigitHs(hts: string): string {
  const digits = hts.replace(/\D/g, '');
  if (digits.length < 6) return hts;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}`;
}

function resolveBackingWording(backing?: string): string {
  if (!backing) return DEFAULT_BACKING_WORDING;
  const key = backing.trim().toLowerCase();
  return BACKING_WORDING[key] ?? backing.trim().toLowerCase();
}

export function getCustomsData(order: Order): CustomsData {
  const quantity     = order.patchesQuantity ?? 0;
  const totalValue   = order.orderAmount ?? null;
  const unitValue    = totalValue != null && quantity > 0 ? totalValue / quantity : null;

  // Country: stored as COUNTRY_OPTIONS string ('USA', 'NEW ZEALAND', ...). Null/empty = unknown.
  const countryRaw     = (order.country ?? '').trim();
  const countryMissing = countryRaw === '';
  const isInternational = !countryMissing && countryRaw.toUpperCase() !== 'USA';

  const base: CustomsData = {
    manufacturerName:    CUSTOMS_CONSTANTS.manufacturerName,
    manufacturerAddress: CUSTOMS_CONSTANTS.manufacturerAddress,
    countryOfOrigin:     CUSTOMS_CONSTANTS.countryOfOrigin,
    isoCountryCode:      CUSTOMS_CONSTANTS.isoCountryCode,
    midCode:             CUSTOMS_CONSTANTS.midCode,
    reasonForExport:     CUSTOMS_CONSTANTS.reasonForExport,
    incoterms:           CUSTOMS_CONSTANTS.incoterms,
    htsCode:        null,
    htsCodeFull:    null,
    htsAlt:         null,
    material:       null,
    materialAlt:    null,
    quantity,
    unitValueUsd:   unitValue,
    totalValueUsd:  totalValue,
    isShippable:    true,
    needsConfirmation: false,
    confirmationNote:  null,
    isInternational,
    countryMissing,
  };

  const typeKey = (order.patchesType ?? '').trim().toLowerCase();
  const mapping = PATCH_TYPE_CATEGORY[typeKey];

  // Unknown patch type → review manually.
  if (!mapping) {
    return {
      ...base,
      isShippable: false,
      needsConfirmation: true,
      confirmationNote: order.patchesType
        ? `No customs mapping for "${order.patchesType}". Review and classify manually.`
        : 'No patch type set. Review and classify manually.',
    };
  }

  // Non-goods (DST service, sample boxes).
  if (mapping.manualOnly) {
    return {
      ...base,
      isShippable: false,
      needsConfirmation: true,
      confirmationNote: mapping.confirmNote ?? 'No standard customs data for this item type — review manually.',
    };
  }

  const category = mapping.category ? CUSTOMS_CATEGORIES[mapping.category] : undefined;

  // Mapped but no category (e.g. Challenge Coin) → flag, no auto HTS.
  if (!category) {
    return {
      ...base,
      needsConfirmation: true,
      confirmationNote: mapping.confirmNote ?? 'HTS requires manual classification for this item type.',
    };
  }

  const backingText = resolveBackingWording(order.designBacking);

  // Build material: fill {backing}, then append any construction modifier.
  const fill = (template: string) => {
    let text = template.replace('{backing}', backingText);
    if (mapping.modifier) text = `${text} (${mapping.modifier})`;
    return text;
  };

  const htsFull = category.hts;
  const htsCode = isInternational ? toSixDigitHs(htsFull) : htsFull;
  const htsAlt  = category.htsAlt
    ? (isInternational ? toSixDigitHs(category.htsAlt) : category.htsAlt)
    : null;

  const needsConfirmation = !!(category.ambiguous || mapping.forceConfirm);
  const confirmationNote =
    mapping.confirmNote ??
    category.note ??
    (needsConfirmation ? 'Verify HTS classification before filing.' : null);

  return {
    ...base,
    htsCode,
    htsCodeFull: htsFull,
    htsAlt,
    material:    fill(category.material),
    materialAlt: category.materialAlt ? fill(category.materialAlt) : null,
    needsConfirmation,
    confirmationNote,
  };
}

// Plain-text customs block for the "Copy" button — mirrors the printed layout.
export function formatCustomsText(c: CustomsData, orderNumber: string): string {
  const lines: string[] = [
    `COMMERCIAL INVOICE — ${orderNumber}`,
    ``,
    `Manufacturer: ${c.manufacturerName}`,
    `Address: ${c.manufacturerAddress}`,
    `Country of Origin: ${c.countryOfOrigin} (${c.isoCountryCode})`,
    `MID: ${c.midCode}`,
  ];

  if (c.isShippable && c.htsCode) {
    lines.push(`HTS Code: ${c.htsCode}${c.htsAlt ? `  (alt: ${c.htsAlt})` : ''}`);
    if (c.material) lines.push(`Material: ${c.material}`);
  } else {
    lines.push(`HTS Code: — (manual classification required)`);
  }

  lines.push(`Quantity: ${c.quantity} pcs`);
  lines.push(`Reason for Export: ${c.reasonForExport}`);
  lines.push(`Incoterms: ${c.incoterms}`);

  if (c.needsConfirmation && c.confirmationNote) {
    lines.push(``, `⚠ ${c.confirmationNote}`);
  }
  if (c.countryMissing) {
    lines.push(`⚠ Destination country not set — HTS shown as US 10-digit. Set country for international 6-digit HS.`);
  }

  return lines.join('\n');
}
