import { describe, it, expect } from 'vitest';
import { toCssHex } from './colourSwatch';

describe('toCssHex', () => {
  it('accepts a hex with or without the leading #', () => {
    // The website says "normalised to lowercase 6-digit" without specifying the #.
    // Both shapes have to paint, because `background-color: 1e3a8a` is silently invalid.
    expect(toCssHex('#1e3a8a')).toBe('#1e3a8a');
    expect(toCssHex('1e3a8a')).toBe('#1e3a8a');
    expect(toCssHex('#1E3A8A')).toBe('#1e3a8a');
    expect(toCssHex('  1E3A8A  ')).toBe('#1e3a8a');
  });

  it('accepts 3-digit shorthand', () => {
    expect(toCssHex('#abc')).toBe('#abc');
    expect(toCssHex('ABC')).toBe('#abc');
  });

  it('refuses anything that is not a hex', () => {
    // customer_colour_input is free text and must never be coerced into a swatch —
    // a confidently-wrong colour is worse than no colour.
    expect(toCssHex('royal blue')).toBeNull();
    expect(toCssHex('PMS 186 C')).toBeNull();
    expect(toCssHex('#12345')).toBeNull();
    expect(toCssHex('#1e3a8az')).toBeNull();
    expect(toCssHex('')).toBeNull();
    expect(toCssHex(null)).toBeNull();
    expect(toCssHex(undefined)).toBeNull();
  });

  it('does not let a CSS injection through', () => {
    expect(toCssHex('red; background-image:url(x)')).toBeNull();
  });
});
