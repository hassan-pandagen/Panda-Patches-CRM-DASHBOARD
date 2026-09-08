// The browser copy of the multi-type rules must agree with the database.
//
// Postgres enforces these in the CHECK constraint `orders_additional_patch_types_valid`. If the
// form ever produces a value the constraint rejects, the agent gets a raw constraint error on
// save with nothing they can do about it — so each case below is named for the DB rule it
// mirrors. Verified against the live constraint on 9 Sept 2026: setting the extra type equal to
// the primary on PP-11337 was rejected with 23514.

import { describe, it, expect } from 'vitest';
import {
  normalizeExtraPatchTypes,
  toAdditionalPatchTypesPayload,
  allPatchTypes,
  MAX_ADDITIONAL_PATCH_TYPES,
} from './patchTypes';

describe('normalizeExtraPatchTypes', () => {
  it('keeps a genuine mixed order intact and in order', () => {
    expect(normalizeExtraPatchTypes(['Woven', 'Chenille'], 'Leather')).toEqual(['Woven', 'Chenille']);
  });

  it('drops a repeat of the primary — the DB rejects that outright', () => {
    // Reachable without any mistake by the agent: add Woven as an extra, then change the
    // primary from Leather to Woven. The form has to agree with the constraint, not fight it.
    expect(normalizeExtraPatchTypes(['Woven', 'Chenille'], 'Woven')).toEqual(['Chenille']);
  });

  it('drops duplicates, keeping the first', () => {
    expect(normalizeExtraPatchTypes(['Woven', 'Woven'], 'Leather')).toEqual(['Woven']);
  });

  it('drops blanks, whitespace and nullish entries', () => {
    expect(normalizeExtraPatchTypes(['Woven', '', '   ', null, undefined], 'Leather')).toEqual(['Woven']);
  });

  it('trims, so " Woven" and "Woven" are one type and not two', () => {
    expect(normalizeExtraPatchTypes([' Woven ', 'Woven'], 'Leather')).toEqual(['Woven']);
  });

  it('caps at the same length the DB does', () => {
    const many = Array.from({ length: 25 }, (_, i) => `Type ${i}`);
    expect(normalizeExtraPatchTypes(many, 'Leather')).toHaveLength(MAX_ADDITIONAL_PATCH_TYPES);
  });

  it('survives a non-array, which is what an older row deserialises to', () => {
    expect(normalizeExtraPatchTypes(null, 'Leather')).toEqual([]);
    expect(normalizeExtraPatchTypes(undefined, 'Leather')).toEqual([]);
    expect(normalizeExtraPatchTypes([], 'Leather')).toEqual([]);
  });

  it('does not police the vocabulary — the primary field never has', () => {
    // 34 distinct patch_type strings exist in production, including combination products whose
    // names carry '+', and letter packages with parentheses and an en-dash. A whitelist here
    // would reject spellings patches_type itself accepts.
    const odd = ['Glitter+Chenille', 'Chenille Alphabet Package (A–Z)', 'PVC Patches'];
    expect(normalizeExtraPatchTypes(odd, 'Embroidered')).toEqual(odd);
  });
});

describe('toAdditionalPatchTypesPayload', () => {
  it('writes NULL for an ordinary single-type order, never an empty array', () => {
    // NULL keeps the 1,216 existing rows and every future single-type order identical, and makes
    // "is this a mixed order" a plain NULL check.
    expect(toAdditionalPatchTypesPayload([], 'Leather')).toBeNull();
    expect(toAdditionalPatchTypesPayload(null, 'Leather')).toBeNull();
    expect(toAdditionalPatchTypesPayload(['Leather'], 'Leather')).toBeNull();
  });

  it('writes the cleaned list for a mixed order', () => {
    expect(toAdditionalPatchTypesPayload(['Woven', '', 'Woven'], 'Leather')).toEqual(['Woven']);
  });
});

describe('allPatchTypes', () => {
  it('puts the primary first — mirrors the generated all_patch_types column', () => {
    expect(allPatchTypes('Leather', ['Woven'])).toEqual(['Leather', 'Woven']);
  });

  it('is just the primary for a normal order', () => {
    expect(allPatchTypes('Leather', null)).toEqual(['Leather']);
  });

  it('is empty when there is no type at all', () => {
    // 5 production rows have a null or blank patches_type; the generated column gives them {}.
    expect(allPatchTypes(null, null)).toEqual([]);
    expect(allPatchTypes('   ', [])).toEqual([]);
  });
});
