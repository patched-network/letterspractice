import { onUnmounted, ref } from 'vue';

/**
 * Click-to-copy for admin views. `copiedKey` holds a transient marker keyed by
 * an arbitrary string, so any number of affordances can each show their own
 * tick without a per-button ref:
 *
 *   :icon="copiedKey === 'x' ? 'mdi-check' : 'mdi-content-copy'"
 *   @click="copyText(textForX(), 'x')"
 */
export function useClickToCopy(logTag = 'admin') {
  const copiedKey = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function copyText(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey.value = key;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        copiedKey.value = null;
      }, 1400);
    } catch (err) {
      console.warn(`[${logTag}] clipboard write failed`, err);
    }
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });

  return { copiedKey, copyText };
}
