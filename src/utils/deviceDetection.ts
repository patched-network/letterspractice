/**
 * Device / input-capability detection utilities.
 *
 * Motivating case: ProgressiveKeyboard's Shift key. Curriculum is
 * lowercase-first (best practice for early literacy), but most physical
 * keyboards have uppercase keycaps — a mismatch that makes it harder for a
 * learner to locate a letter they know by its lowercase shape. Shift only
 * helps when a *physical* keyboard is in play:
 *  - laptops/desktops: on by default (keycaps are almost always uppercase)
 *  - Chrome OS: off by default (Chromebook keycaps are already lowercase,
 *    so there's no mismatch to mitigate)
 *  - touch-only devices (phones, plain tablets): off by default (the
 *    learner is typing on this on-screen keyboard directly, not reading a
 *    physical one, so there's nothing to reconcile)
 *
 * There is no standardized "is a hardware keyboard attached" API, so this
 * is a best-effort heuristic built from:
 *  - CSS pointer/hover media features (spec-standard, dynamic, widely
 *    supported) to distinguish touch-primary devices from mouse/trackpad
 *    ones.
 *  - A Chrome OS check (Client Hints + UA fallback) — unusually reliable
 *    UA sniffing since Chrome OS ships only one browser.
 *  - A phone/tablet UA check, as a backstop for browsers whose any-pointer/
 *    any-hover reporting is wrong (see isMobileUserAgent).
 *
 * Ambiguous or unreadable signals resolve toward the laptop/desktop
 * assumption (Shift shown): a false positive is just an extra harmless
 * on-screen key, while a false negative leaves a real keycap mismatch
 * unaddressed and makes the activity harder in ways that are hard for a
 * learner to diagnose.
 */

export interface DeviceInputSignals {
  /** (pointer: coarse) — primary input mechanism is imprecise (touch) */
  primaryPointerCoarse: boolean;
  /** (hover: none) — primary input mechanism cannot hover */
  primaryHoverNone: boolean;
  /** (any-pointer: fine) — some available input mechanism is precise (mouse/trackpad/stylus) */
  anyPointerFine: boolean;
  /** (any-hover: hover) — some available input mechanism can hover */
  anyHoverHover: boolean;
}

function supportsMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/**
 * Snapshot of the current pointer/hover media-feature signals. When
 * matchMedia isn't available (SSR, non-browser test environments), returns
 * signals that resolve toward "has a fine/hoverable input" — consistent
 * with this module's bias toward the laptop/desktop default.
 */
export function getDeviceInputSignals(): DeviceInputSignals {
  if (!supportsMatchMedia()) {
    return {
      primaryPointerCoarse: false,
      primaryHoverNone: false,
      anyPointerFine: true,
      anyHoverHover: true,
    };
  }

  return {
    primaryPointerCoarse: window.matchMedia("(pointer: coarse)").matches,
    primaryHoverNone: window.matchMedia("(hover: none)").matches,
    anyPointerFine: window.matchMedia("(any-pointer: fine)").matches,
    anyHoverHover: window.matchMedia("(any-hover: hover)").matches,
  };
}

/**
 * True only when there is no evidence of any fine/hoverable input
 * mechanism anywhere on the device — i.e. a touch-only phone or tablet.
 * Any ambiguity (e.g. a hybrid/2-in-1 with a mouse or trackpad attached)
 * resolves to false, per this module's bias toward the laptop/desktop
 * default.
 */
export function isTouchOnlyDevice(
  signals: DeviceInputSignals = getDeviceInputSignals(),
): boolean {
  return (
    signals.primaryPointerCoarse &&
    signals.primaryHoverNone &&
    !signals.anyPointerFine &&
    !signals.anyHoverHover
  );
}

/**
 * True if running on Chrome OS (Chromebook). Prefers User-Agent Client
 * Hints (`navigator.userAgentData.platform`, Chromium-only) and falls back
 * to UA string sniffing for `CrOS`. The UA fallback is more reliable here
 * than typical UA sniffing because Chrome OS ships only Chrome as its
 * browser, so there's no cross-browser ambiguity to worry about.
 */
export function isChromeOS(): boolean {
  if (typeof navigator === "undefined") return false;

  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  if (uaData?.platform) {
    return uaData.platform === "Chrome OS";
  }

  return /\bCrOS\b/.test(navigator.userAgent);
}

/**
 * True when the User-Agent identifies a phone- or tablet-class device.
 *
 * This exists because the media-feature signals above can't be trusted on
 * their own: Firefox on Android reports a fine/hoverable secondary pointer
 * with nothing of the sort attached, so `isTouchOnlyDevice()` returns false
 * on a plain phone and Shift was rendering there. A UA check is a blunt
 * instrument, but "is this a phone" is one of the few questions UA strings
 * still answer reliably.
 *
 * Prefers the Client Hints `mobile` boolean when it says yes, and otherwise
 * falls back to UA tokens — deliberately in that order, since Chromium
 * reports `mobile: false` on Android tablets, which we still want to catch.
 *
 * Note this reads as "touch device" rather than "no hardware keyboard": an
 * Android tablet with a keyboard case is a false positive. That's the right
 * trade here anyway — Shift is the mitigation for a keycap-casing mismatch,
 * and that pairing is rare enough in this audience that costing it an
 * on-screen Shift beats showing a dead key to every phone user.
 */
export function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;

  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  if (uaData?.mobile === true) return true;

  return /Android|iPhone|iPod|iPad|IEMobile|Opera Mini|\bMobile\b/i.test(
    navigator.userAgent,
  );
}

/**
 * Default for ProgressiveKeyboard's `showShift` prop (used whenever a
 * consumer doesn't explicitly pass one): on for likely laptop/desktop use,
 * off for Chrome OS, touch-only devices, and phones/tablets.
 */
export function getDefaultShowShift(): boolean {
  if (isChromeOS()) return false;
  if (isTouchOnlyDevice()) return false;
  if (isMobileUserAgent()) return false;
  return true;
}
