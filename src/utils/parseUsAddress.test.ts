import { describe, it, expect } from 'vitest';
import { parseUsAddress } from './parseUsAddress';

describe('parseUsAddress', () => {
  it('parses a multi-line pasted label (the common agent paste)', () => {
    expect(parseUsAddress('HC 3 BOX 25A\nHooker, OK\n73945')).toEqual({
      city: 'Hooker', state: 'OK', postal: '73945',
    });
  });

  it('handles an "Attention to:" line and a # unit number', () => {
    expect(parseUsAddress('Attention to: Krystal Ortega\n3200 N Central Ave #1450\nPhoenix, AZ 85012')).toEqual({
      city: 'Phoenix', state: 'AZ', postal: '85012',
    });
  });

  it('parses a single-line address', () => {
    expect(parseUsAddress('68 Talcott Ave, Crystal Lake, IL 60014')).toEqual({
      city: 'Crystal Lake', state: 'IL', postal: '60014',
    });
  });

  it('keeps only the 5-digit ZIP from ZIP+4', () => {
    expect(parseUsAddress('1234 Main St Apt 5, Los Angeles, CA 90001-1234').postal).toBe('90001');
  });

  it('accepts a full state name', () => {
    expect(parseUsAddress('12 Elm St, Hooker, Oklahoma 73945')).toEqual({
      city: 'Hooker', state: 'OK', postal: '73945',
    });
  });

  it('does NOT mistake a street suffix for a state', () => {
    // "St" is not a state — must not be returned as one.
    const r = parseUsAddress('1234 Main St 77001');
    expect(r.state).toBeNull();
    expect(r.postal).toBe('77001');
  });

  it('returns nulls for empty/garbage input', () => {
    expect(parseUsAddress('')).toEqual({ city: null, state: null, postal: null });
    expect(parseUsAddress(null)).toEqual({ city: null, state: null, postal: null });
    expect(parseUsAddress('no address here')).toEqual({ city: null, state: null, postal: null });
  });
});
