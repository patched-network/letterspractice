/**
 * Fetch-ahead audio: downloads a known set of clips into memory and hands
 * back object URLs at play time, so playback doesn't wait on the network.
 *
 * fetch() rather than `new Audio().load()` (cf. phonemeCache.ts): media
 * preload is at the browser's discretion — iOS Safari has historically
 * ignored it — while a fetch always downloads.
 *
 * resolve() never waits. A clip still in flight (or failed) plays from its
 * network URL, exactly as it would with no prefetch at all.
 */

export interface AudioPrefetch {
  /** Queue clips for download, one at a time, in the order given. */
  prefetch(urls: string[]): void;
  /** The in-memory copy of `url` if it has arrived, else `url` itself. */
  resolve(url: string): string;
  /** Abort pending downloads and release the in-memory copies. */
  dispose(): void;
}

export function createAudioPrefetch(): AudioPrefetch {
  const ready = new Map<string, string>();
  const seen = new Set<string>();
  const queue: string[] = [];
  const abort = new AbortController();
  let draining = false;
  let disposed = false;

  async function drain(): Promise<void> {
    draining = true;
    while (queue.length && !disposed) {
      const url = queue.shift()!;
      try {
        const res = await fetch(url, { signal: abort.signal });
        // A missing file comes back as the SPA's index.html with a 200
        // (Caddy try_files, vite's fallback) — leave those to the network
        // path, which fails the same way it always has.
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.startsWith('audio/')) {
          throw new Error(`HTTP ${res.status} ${type}`);
        }
        const blob = await res.blob();
        if (disposed) break;
        ready.set(url, URL.createObjectURL(blob));
      } catch (e) {
        if (disposed) break;
        console.warn(`[audioPrefetch] ${url}:`, e);
      }
    }
    draining = false;
  }

  return {
    prefetch(urls) {
      if (disposed) return;
      for (const url of urls) {
        if (!url || seen.has(url)) continue;
        seen.add(url);
        queue.push(url);
      }
      if (!draining) void drain();
    },
    resolve(url) {
      return ready.get(url) ?? url;
    },
    dispose() {
      disposed = true;
      abort.abort();
      queue.length = 0;
      for (const objectUrl of ready.values()) URL.revokeObjectURL(objectUrl);
      ready.clear();
    },
  };
}
