// Copy text to the clipboard, reliably — including on iOS.
//
// navigator.clipboard.writeText() alone is NOT enough on iPhone/iPad: every iOS browser (Chrome
// and Firefox included) runs WebKit, where the API is missing on older versions and throws when
// the call isn't tightly bound to a user gesture. The shipping-label copy buttons failed on an
// iPhone for exactly this reason.
//
// So: try the modern API, and fall back to a hidden textarea + execCommand('copy'). The fallback
// needs iOS-specific handling — .select() does nothing there; it requires a Range selection on a
// contentEditable element plus setSelectionRange().
//
// Call this DIRECTLY inside the click handler with no awaits before it, or iOS drops the gesture.

const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as MacIntel with touch points
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Keep it off-screen but still selectable — display:none / visibility:hidden break the copy.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    // 16px stops iOS from zooming the viewport when the field is focused.
    ta.style.fontSize = '16px';
    document.body.appendChild(ta);

    if (isIOS()) {
      ta.contentEditable = 'true';
      ta.readOnly = false;
      const range = document.createRange();
      range.selectNodeContents(ta);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      ta.setSelectionRange(0, 999999);
    } else {
      ta.select();
    }

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Returns true when the text made it to the clipboard. Never throws. */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  // Modern path — requires a secure context (https) and, on iOS, an active user gesture.
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the legacy path below
  }

  return legacyCopy(value);
}
