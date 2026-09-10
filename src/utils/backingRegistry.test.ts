// The backing list has to be ONE list.
//
// It drifted badly and silently: both quote forms carried their own hand-written <option>s.
// New Quote wrote "Iron On" / "Velcro" / "Adhesive"; the Edit Quote modal wrote short codes —
// "iron", "sew", "velcro". None of those are backing values, so a quote saved from either form
// arrived with a backing the ORDER form's <select> could not display, and editing a quote
// silently replaced a good backing with "iron". Both lists were also missing Magnetic and
// Button-Loop entirely.
//
// Nothing caught it because each list was valid TypeScript on its own. These tests check the
// thing that actually matters: that the registries agree, and that no component has started
// writing its own list again.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { DESIGN_BACKING_OPTIONS } from '../constants/options';
import { BACKING_CANON, BACKING_ALIAS, normalizeBacking } from './patchVocab';

const SRC = resolve(__dirname, '..');
const WEBHOOK = resolve(__dirname, '../../supabase/functions/square-payment-webhook/index.ts');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('backing registry', () => {
  it('has the eight backings, in one order', () => {
    expect(DESIGN_BACKING_OPTIONS).toEqual([
      'Iron-On',
      'Sew-On',
      'Velcro (Hook & Loop)',
      'Adhesive (Peel & Stick)',
      'Magnetic',
      'Button-Loop',
      'Butterfly Clutch',
      'Pin Back',
    ]);
  });

  it('the form list and the normalizer agree', () => {
    // If these diverge, a value the normalizer produces can be one the <select> cannot render,
    // which shows as a blank dropdown and wipes the field on save.
    expect(BACKING_CANON).toEqual(DESIGN_BACKING_OPTIONS);
  });

  it('the edge function carries the same list — it cannot import from src/', () => {
    const src = readFileSync(WEBHOOK, 'utf-8');
    for (const backing of DESIGN_BACKING_OPTIONS) {
      expect(src, `webhook is missing "${backing}"`).toContain(`'${backing}'`);
    }
  });

  it('every alias resolves to a real backing', () => {
    for (const [alias, target] of Object.entries(BACKING_ALIAS)) {
      expect(DESIGN_BACKING_OPTIONS, `alias "${alias}" points at "${target}"`).toContain(target);
    }
  });

  it('folds the spellings people actually type', () => {
    expect(normalizeBacking('butterfly')).toBe('Butterfly Clutch');
    expect(normalizeBacking('Butterfly Clutch')).toBe('Butterfly Clutch');
    expect(normalizeBacking('pin back')).toBe('Pin Back');
    expect(normalizeBacking('pinback')).toBe('Pin Back');
    // "Safety pin" is the same backing under another name, not a ninth option.
    expect(normalizeBacking('safety pin')).toBe('Pin Back');
    // And the legacy spellings the quote forms used to write still land correctly.
    expect(normalizeBacking('Iron On')).toBe('Iron-On');
    expect(normalizeBacking('iron')).toBe('Iron-On');
    expect(normalizeBacking('velcro')).toBe('Velcro (Hook & Loop)');
  });

  it('no component writes its own backing list', () => {
    // The check that would have caught the quote forms. A backing <option> whose value is
    // hardcoded rather than mapped from DESIGN_BACKING_OPTIONS is the drift starting again.
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf-8');
      // <option value="Iron On"> / <option value="iron"> / <option value="velcro"> ...
      const re = /<option\s+value=["'](iron|sew|velcro|adhesive|magnetic|button|iron[ -]?on|sew[ -]?on|pin[ -]?back|butterfly[a-z ]*)["']/gi;
      if (re.test(text)) offenders.push(file.replace(SRC, 'src'));
    }
    expect(offenders, `hardcoded backing options found in:\n${offenders.join('\n')}`).toEqual([]);
  });
});
