/**
 * Lazy loader for Google Identity Services (the "Sign in with Google" script).
 *
 * Loaded on demand by GoogleSignInButton, so only /login and /signup pay for
 * it. Resolves null (never rejects) when the script is blocked (ad blockers,
 * offline, CSP) or slow, so callers can silently fall back to the password
 * form. The index.html CSP must allow https://accounts.google.com/gsi/.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const LOAD_TIMEOUT_MS = 8000;

/** The slice of the GIS API we use. */
export interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

let loading: Promise<GoogleAccountsId | null> | null = null;

export function loadGoogleIdentity(): Promise<GoogleAccountsId | null> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;

  loading = new Promise<GoogleAccountsId | null>((resolve) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;

    const timer = setTimeout(() => finish(), LOAD_TIMEOUT_MS);
    function finish() {
      clearTimeout(timer);
      resolve(window.google?.accounts?.id ?? null);
    }
    script.onload = finish;
    script.onerror = finish;
    document.head.appendChild(script);
  }).then((api) => {
    // Allow a later retry (e.g. next visit to the page) after a failure.
    if (!api) loading = null;
    return api;
  });
  return loading;
}
