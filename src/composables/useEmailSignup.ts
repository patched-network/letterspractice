import { ref } from 'vue';

/**
 * Default endpoint. Relative on purpose: in the SPA the page and the business
 * backend are the same origin (Caddy serves the backend at
 * letterspractice.com/backend/*), so no CORS is involved.
 */
const DEFAULT_ENDPOINT = '/backend/mailer/email-signup';

export interface EmailSignupOptions {
  site: string; // Which site/course (e.g., 'letterspractice')
  /**
   * Override the POST target. The VitePress blog needs this: it is served from
   * a separate Cloudflare Pages origin and only *proxied* onto
   * letterspractice.com/blog/*, so a relative path would resolve against
   * pages.dev on PR previews. See NewsletterSignup.vue in commercial's lp-blog/ (the blog moved there 2026-10-28).
   */
  endpoint?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onAlreadySubscribed?: () => void;
}

export interface EmailSignupMetadata {
  referrer?: string;
  signupPage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export function useEmailSignup(options: EmailSignupOptions) {
  const submitting = ref(false);
  const error = ref<string | null>(null);
  const success = ref(false);
  const alreadySubscribed = ref(false);

  /**
   * Capture metadata from browser and URL
   */
  function captureMetadata(): EmailSignupMetadata {
    const url = new URL(window.location.href);

    return {
      referrer: document.referrer || undefined,
      signupPage: window.location.pathname,
      utmSource: url.searchParams.get('utm_source') || undefined,
      utmMedium: url.searchParams.get('utm_medium') || undefined,
      utmCampaign: url.searchParams.get('utm_campaign') || undefined,
    };
  }

  /**
   * Submit email signup
   */
  async function submitEmail(email: string): Promise<boolean> {
    if (!email || !email.includes('@')) {
      error.value = 'Please enter a valid email address';
      return false;
    }

    submitting.value = true;
    error.value = null;
    success.value = false;
    alreadySubscribed.value = false;

    try {
      const metadata = captureMetadata();

      const response = await fetch(options.endpoint ?? DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: email,
          site: options.site,
          ...metadata,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || response.statusText);
      }

      const data = await response.json();

      if (data.alreadySubscribed) {
        alreadySubscribed.value = true;
        options.onAlreadySubscribed?.();
      } else {
        success.value = true;
        options.onSuccess?.();
      }

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit email';
      error.value = errorMessage;
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
      return false;
    } finally {
      submitting.value = false;
    }
  }

  /**
   * Reset state
   */
  function reset() {
    submitting.value = false;
    error.value = null;
    success.value = false;
    alreadySubscribed.value = false;
  }

  return {
    submitting,
    error,
    success,
    alreadySubscribed,
    submitEmail,
    reset,
  };
}
