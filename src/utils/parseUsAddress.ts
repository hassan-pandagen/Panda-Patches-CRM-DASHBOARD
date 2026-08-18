// Parse a free-text US shipping address into structured City / State / ZIP.
// Used to auto-fill the structured ship_* fields when an agent pastes a full address, so clean geo
// data lands on the order without anyone re-typing it (agents were leaving these blank).
//
// Strategy: ZIP is the reliable anchor (5-digit run). The state is the 2-letter code (or full name)
// immediately before it — VALIDATED against the real state list so a street suffix like "St" or
// "Ave" is never mistaken for a state. City is the segment between the previous comma and the state.
// Newlines are normalized to commas first, so a pasted multi-line label parses like a single line:
//   "HC 3 BOX 25A\nHooker, OK\n73945"  ->  { city: 'Hooker', state: 'OK', postal: '73945' }

const STATE_BY_NAME: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'puerto rico': 'PR', 'virgin islands': 'VI', guam: 'GU',
};

const STATE_CODES = new Set([...Object.values(STATE_BY_NAME), 'DC', 'PR', 'VI', 'GU', 'AS', 'MP']);

export interface ParsedUsAddress {
  city: string | null;
  state: string | null;
  postal: string | null;
}

export function parseUsAddress(addr?: string | null): ParsedUsAddress {
  const empty: ParsedUsAddress = { city: null, state: null, postal: null };
  if (!addr || !String(addr).trim()) return empty;

  // Newlines -> commas so multi-line labels parse like "street, city, ST zip"
  const norm = String(addr)
    .replace(/\r/g, '')
    .replace(/\n+/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  const zipMatch = norm.match(/\b(\d{5})(?:-\d{4})?\b/);
  const postal = zipMatch ? zipMatch[1] : null;

  let state: string | null = null;
  let city: string | null = null;
  let matchedName: string | null = null; // set when the state was written out in full

  // Everything before the ZIP (or the whole string when there's no ZIP) holds city + state.
  const head = (zipMatch ? norm.slice(0, zipMatch.index) : norm).replace(/[\s,]+$/, '');

  // State: 2-letter code at the end — only when it's a REAL state code.
  const codeMatch = head.match(/\b([A-Za-z]{2})$/);
  if (codeMatch && STATE_CODES.has(codeMatch[1].toUpperCase())) {
    state = codeMatch[1].toUpperCase();
  } else {
    // Full state name at the end ("...Hooker, Oklahoma")
    for (const [name, code] of Object.entries(STATE_BY_NAME)) {
      if (new RegExp(`(^|[,\\s])${name}$`, 'i').test(head)) { state = code; matchedName = name; break; }
    }
  }

  if (state) {
    // Strip the state off the end — using the form we actually matched, so a full name like
    // "Oklahoma" isn't clipped to "Oklaho" by the 2-letter rule. Then the city is what follows
    // the last comma.
    const beforeState = (matchedName
      ? head.replace(new RegExp(`\\s*,?\\s*${matchedName}$`, 'i'), '')
      : head.replace(/\s*,?\s*[A-Za-z]{2}$/, '')
    ).replace(/[\s,]+$/, '');
    const lastComma = beforeState.lastIndexOf(',');
    if (lastComma >= 0) {
      city = beforeState.slice(lastComma + 1).trim() || null;
    }
  }

  return { city, state, postal };
}
