import { describe, it, expect } from 'vitest';
import { normalizePatchType, normalizeBacking } from './patchVocab';

// These two functions guard the order form's dropdowns: a value that doesn't exactly
// match an <option> renders blank. They also have an INLINE copy inside the Square webhook
// (Deno can't import src/), so this fixture doubles as the contract both must honor.

describe('normalizePatchType', () => {
  it('passes canonical values through untouched', () => {
    expect(normalizePatchType('Embroidered')).toBe('Embroidered');
    expect(normalizePatchType('PVC')).toBe('PVC');
    expect(normalizePatchType('Sample Box')).toBe('Sample Box');
  });

  it('matches case / spacing / punctuation-insensitively', () => {
    expect(normalizePatchType('pvc')).toBe('PVC');
    expect(normalizePatchType('  embroidered ')).toBe('Embroidered');
    expect(normalizePatchType('3D Embroidery Puff')).toBe('3D Embroidery Puff');
  });

  it('maps known storefront aliases to canonical values', () => {
    expect(normalizePatchType('Custom PVC Patches')).toBe('PVC');
    expect(normalizePatchType('customembroideredpatches')).toBe('Embroidered');
    expect(normalizePatchType('3d-embroidered')).toBe('3D Embroidery Puff');
    expect(normalizePatchType('silicone')).toBe('Silicone Transfer');
    expect(normalizePatchType('pvckeychain')).toBe('PVC Keychains');
  });

  it('keeps unknown/ambiguous values rather than dropping or guessing', () => {
    expect(normalizePatchType('Custom Patch')).toBe('Custom Patch');
    expect(normalizePatchType('printed')).toBe('printed');
  });

  it('returns null for empty/nullish input', () => {
    expect(normalizePatchType('')).toBeNull();
    expect(normalizePatchType('   ')).toBeNull();
    expect(normalizePatchType(null)).toBeNull();
    expect(normalizePatchType(undefined)).toBeNull();
  });
});

describe('normalizeBacking', () => {
  it('normalizes the common storefront spellings of iron-on', () => {
    expect(normalizeBacking('Iron on')).toBe('Iron on');
    expect(normalizeBacking('iron-on')).toBe('Iron on');
    expect(normalizeBacking('Iron On')).toBe('Iron on');
    expect(normalizeBacking('iron')).toBe('Iron on');
    expect(normalizeBacking('heatpress')).toBe('Iron on');
  });

  it('normalizes the other backings', () => {
    expect(normalizeBacking('velcro')).toBe('Velcro');
    expect(normalizeBacking('sew')).toBe('Sew on');
    expect(normalizeBacking('adhesive')).toBe('Sticker');
    expect(normalizeBacking('stickerbacking')).toBe('Sticker');
  });

  it('keeps unknown values and returns null for empty', () => {
    expect(normalizeBacking('magnetic')).toBe('magnetic');
    expect(normalizeBacking('')).toBeNull();
    expect(normalizeBacking(null)).toBeNull();
  });
});
