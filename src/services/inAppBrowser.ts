/**
 * In-app browser detection (Facebook, Instagram, TikTok, other webviews).
 *
 * Links shared in parent groups open in these by default. Google blocks its
 * sign-in inside embedded webviews ("disallowed_useragent"), so the Google
 * button is hidden there in favour of an "open in your browser" hint.
 *
 * Mirrors the backend's classifyUserAgent
 * (backend/src/services/signup-context.service.ts), which records the same
 * categories at signup; keep the two in step. Detection is best-effort, so
 * callers must still cope with GIS failing to load.
 */

export type BrowserContext = 'facebook' | 'instagram' | 'tiktok' | 'webview' | 'browser';

export function classifyBrowser(ua: string = navigator.userAgent): BrowserContext {
  if (!ua) return 'browser';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua)) return 'facebook';
  if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return 'tiktok';
  if (/Line\/|Snapchat|LinkedInApp|Pinterest|; wv\)/i.test(ua)) return 'webview';
  return 'browser';
}

export function isInAppBrowser(ua?: string): boolean {
  return classifyBrowser(ua) !== 'browser';
}
