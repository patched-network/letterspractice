import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';

/**
 * Contain-fit scale factor for a fixed-size reference frame inside a
 * variable-size container.
 *
 * Vignette scenes are authored against a fixed logical frame (see
 * VIGNETTE_FRAME in ./types). The host component renders that frame at its
 * logical pixel size and applies `scale(...)` to fit the available space —
 * choreography, physics, and actor placement never see the real container
 * dimensions, so a scene that works in the dbg viewer works everywhere.
 *
 * The returned scale is uniform (no distortion) and unclamped: small
 * containers scale below 1, large ones above.
 */
export function useContainScale(
  container: Ref<HTMLElement | null>,
  refWidth: number,
  refHeight: number,
) {
  const scale = ref(1);
  let observer: ResizeObserver | null = null;

  function update(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    scale.value = Math.min(width / refWidth, height / refHeight);
  }

  onMounted(() => {
    const el = container.value;
    if (!el) return;
    update(el.clientWidth, el.clientHeight);
    observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) update(rect.width, rect.height);
    });
    observer.observe(el);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { scale };
}
