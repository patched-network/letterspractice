<!--
  SessionVideoSection.vue

  The front-page demo video: just the frame, straddling the seam between the
  hero and UnderTheHoodSection (2026-11-13; it was a full section with a
  title, lede and a timestamped "notables" list, at the hero → walkthrough
  seam). The section's background is the two neighbours' edge colours, split
  at half height, so the frame reads as sitting across the border without
  overlapping either section (the hero is prerendered and must not shift).
  If either neighbour's edge colour changes, change it here too.

  PLACEMENT RATIONALE (2026-07-27) — this is deliberately NOT in the hero:
    - The hero's scarce resource is the CTA click, and /peek (a live,
      zero-commitment trial) is stronger evidence than any video. A player up
      there competes with the thing that converts better.
    - The hero already carries the brand's signature moment (the animated
      "Hello!" LetterPeople). A thumbnail next to it splits the visual focus.
    - The audio is load-bearing — the demo's design rejected continuous
      mirroring precisely because it "splits attention away from the audio,
      which is carrying the best material." So this needs deliberate, sound-on,
      user-initiated playback, which is a poor fit for hero ambient video.
    - Rhetorically: the walkthrough self-identifies as a STYLIZED mock. Real
      footage before it establishes that the mock simplifies something that
      exists.

  To move it, move the one line in LandingPage.vue, and redo the split
  background (.session-video) for its new neighbours.

  DELIVERY NOTES:
    - `preload="none"` + poster: the median visitor downloads the poster
      (~20–50 KB, sized to the screen), not 19 MB. Only people who press play
      pull the video. The poster is an app asset (src/assets/session-video/,
      scripts/make-poster-variants.sh), served with the app; only the video is
      on the media host.
    - Served from a separate media host (MEDIA_BASE, its /v/ route), referenced
      DIRECTLY — never via a path the app's own server proxies, which would
      route every byte through that server. The /v/ route is the one that
      answers Range requests, so it's the only one you can seek in.
    - ⚠ That cross-origin host must be listed in `media-src` in the CSP meta tag
      in index.html; scripts/vite-plugin-deployment-csp.ts adds
      it from VITE_MEDIA_BASE. It isn't covered by anything else: the poster loads fine
      either way (same origin now; `img-src` is wide open regardless), which
      makes a CSP block look like a codec problem — Firefox reports it as "no video with supported format and
      MIME type found", and the URL still plays when opened directly, since CSP
      only binds the document that declares it. Cost a debugging session on
      2026-07-28. Keep `'self'` in that directive or phoneme audio breaks.
    - ⚠ The VIDEO must stay under /v/ (R2, real HTTP 206). Pages' static server
      does not honour Range at all — it answers a ranged GET with 200 and the
      whole body — which broke seeking outright and is the documented reason
      Safari refuses progressive MP4. Moving the video back to the root silently
      restores the original bug: it still plays, it just can't seek. (The
      poster used to be a static file at the media host's root, kept out of
      the Function so the eager per-visitor request didn't spend the Workers
      free tier; it's an app asset now, so it costs that meter nothing.)
    - Filenames are versioned because objects are served `immutable`. A new cut
      ships as a NEW key, never an overwrite (the media host's upload script,
      kept with the deployment, refuses to clobber an existing key). History: demo-720-draft1.mp4 (113.3 s)
      → demo-720-v1.mp4 (112.5 s, 0.8 s trimmed off the head, 2026-07-31).
    - Nothing on the page quotes a time in the video any more (the beat
      timecodes went 2026-11-13). If any come back, they are read off THIS
      key's timeline: re-read them whenever VIDEO_URL is repointed.
-->
<template>
    <section class="session-video" data-screen-label="Demo">
        <div class="sv-inner">
            <figure class="sv-figure">
                <div class="sv-frame" :class="{ 'sv-frame--playing': started }">
                    <!-- Poster + play affordance. Swapped for the real element on
                         click so nothing is fetched until intent is expressed. -->
                    <button
                        v-if="!started"
                        class="sv-poster"
                        type="button"
                        :aria-label="copy.playLabel"
                        @click="start"
                    >
                        <!-- Sized to the frame (POSTER_SIZES); the JPEG is
                             for a browser with neither format. Lazy: the
                             section sits below the hero, and the prerendered
                             page's hidden copy of it then never loads at all. -->
                        <picture>
                            <source type="image/avif" :srcset="POSTER_SRCSET.avif" :sizes="POSTER_SIZES" />
                            <source type="image/webp" :srcset="POSTER_SRCSET.webp" :sizes="POSTER_SIZES" />
                            <img
                                ref="posterImg"
                                :src="POSTER_URL"
                                alt=""
                                width="1280"
                                height="720"
                                loading="lazy"
                                decoding="async"
                            />
                        </picture>
                        <span class="sv-play" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="34" height="34">
                                <path d="M8 5v14l11-7z" fill="currentColor" />
                            </svg>
                        </span>
                        <span class="sv-playtext">
                            <span class="sv-playtext__label">{{ copy.playLabel }}</span>
                            <span class="sv-playtext__meta">{{ copy.meta }}</span>
                        </span>
                    </button>

                    <video
                        v-else
                        ref="videoEl"
                        class="sv-video"
                        :src="VIDEO_URL"
                        :poster="videoPoster"
                        controls
                        playsinline
                        preload="none"
                        width="1280"
                        height="720"
                        @timeupdate="onTimeUpdate"
                        @ended="onEnded"
                    ></video>
                </div>
            </figure>

        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import { landingPageCopy } from "../../content/landingPageCopy";
import { landingEvent, track, type VideoQuartile } from "../../services/landingEvents";
import posterJpg from "../../assets/session-video/poster.jpg";
import { MEDIA_BASE } from "../../config/site";

const copy = landingPageCopy.sessionVideo;

// MEDIA_BASE (VITE_MEDIA_BASE) is referenced directly, NOT through a path the
// app's server proxies (that would route every byte through it). LandingPage
// renders this section only when it is set.

// /v/* is the R2-backed route — the only one that answers Range requests, so the
// only one you can seek in. Root paths are static Pages assets.
const VIDEO_URL = `${MEDIA_BASE}/v/demo-720-v1.mp4`;
// The poster is an app asset (hashed name, same origin), not a media-host file:
// the JPEG plus AVIF and WebP copies at several widths, all made by
// scripts/make-poster-variants.sh. Whatever widths are there are offered.
const POSTER_URL = posterJpg;
const posterVariants = import.meta.glob<string>("../../assets/session-video/poster-*w.{avif,webp}", {
    eager: true,
    query: "?url",
    import: "default",
});
const posterSrcset = (ext: "avif" | "webp") =>
    Object.entries(posterVariants)
        .filter(([path]) => path.endsWith(`.${ext}`))
        .map(([path, url]) => ({ url, width: Number(/-(\d+)w\.\w+$/.exec(path)?.[1]) }))
        .sort((a, b) => a.width - b.width)
        .map(({ url, width }) => `${url} ${width}w`)
        .join(", ");
const POSTER_SRCSET = { avif: posterSrcset("avif"), webp: posterSrcset("webp") };
// The frame's width: .sv-inner's 720 px, less .session-video's side padding
// (24 px, 16 px at ≤ 600 px).
const POSTER_SIZES = "(max-width: 600px) calc(100vw - 32px), (max-width: 768px) calc(100vw - 48px), 720px";
// The <video>'s own poster (seen until playback starts) is whichever file the
// <picture> chose, so pressing play doesn't fetch the JPEG on top.
const posterImg = ref<HTMLImageElement | null>(null);
const videoPoster = ref(POSTER_URL);

const started = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);

// Play only after an explicit click — this counts as a user gesture, so sound
// is allowed. Never autoplay: the audio is the best material in the cut.
const start = async () => {
    track(landingEvent.videoPlay);
    videoPoster.value = posterImg.value?.currentSrc || POSTER_URL;
    started.value = true;
    await nextTick();
    videoEl.value?.play().catch(() => {
        // Autoplay blocked or decode failed — the controls are already visible,
        // so the visitor can start it themselves. Nothing to recover.
    });
};

// Watch-depth events, each once per page load: 25/50/75 when playback first
// reaches that point (a seek past it counts), 100 on `ended`.
const reached = new Set<VideoQuartile>();
const reach = (q: VideoQuartile) => {
    if (reached.has(q)) return;
    reached.add(q);
    track(landingEvent.videoQuartile(q));
};
const onTimeUpdate = () => {
    const v = videoEl.value;
    if (!v || !v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    for (const q of [25, 50, 75] as const) if (pct >= q) reach(q);
};
const onEnded = () => reach(100);
</script>

<style scoped>
/* Top half: the hero's bottom edge (HeroGreeting); bottom half: the
   under-the-hood panel's top edge (UnderTheHoodSection). Equal padding keeps
   the frame centred on the seam. */
.session-video {
    background: linear-gradient(180deg, #fff8e8 50%, #f6f9ff 50%);
    padding: 24px;
}

.sv-inner {
    max-width: 720px;
    margin: 0 auto;
}




.sv-figure {
    margin: 0;
}

.sv-frame {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    background: #000;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
    aspect-ratio: 16 / 9;
}

.sv-poster,
.sv-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sv-poster {
    position: relative;
    padding: 0;
    border: none;
    cursor: pointer;
    background: #000;
    -webkit-tap-highlight-color: transparent;
}

.sv-poster picture {
    display: block;
    width: 100%;
    height: 100%;
}

.sv-poster img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease-out, filter 0.3s ease-out;
}

.sv-poster:hover img {
    transform: scale(1.02);
    filter: brightness(1.04);
}

.sv-poster:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 3px;
}

/* Play button reuses the hub-cta pill physics (white, soft shadow, press-down)
   — the product's own button language, per HeroGreeting.vue. */
.sv-play {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 78px;
    height: 78px;
    border-radius: 50%;
    background: white;
    color: rgba(0, 0, 0, 0.78);
    box-shadow:
        0 6px 14px rgba(0, 0, 0, 0.28),
        inset 0 -4px 0 rgba(255, 152, 0, 0.45);
    transition: transform 0.12s ease-out, box-shadow 0.12s ease-out;
    /* nudge the glyph optically centred */
    padding-left: 5px;
}

.sv-poster:hover .sv-play {
    transform: translate(-50%, -50%) translateY(-2px);
}

.sv-poster:active .sv-play {
    transform: translate(-50%, -50%) translateY(2px);
    box-shadow:
        0 3px 6px rgba(0, 0, 0, 0.28),
        inset 0 -2px 0 rgba(255, 152, 0, 0.45);
}

.sv-playtext {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    /* A scrim, not just a text shadow: the poster's lower half is light
       (the child's white pyjamas), so white text alone washes out. */
    padding: 48px 16px 16px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.35) 55%, transparent 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: white;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.65);
    pointer-events: none;
}

.sv-playtext__label {
    font-weight: 600;
    font-size: 1.05rem;
}

.sv-playtext__meta {
    font-size: 0.82rem;
    opacity: 0.85;
}







@media (max-width: 600px) {
    .session-video {
        padding: 16px;
    }

    .sv-play {
        width: 62px;
        height: 62px;
    }

    .sv-playtext__label {
        font-size: 0.95rem;
    }
}

@media (prefers-reduced-motion: reduce) {
    /* The hero drops its gradient for flat cream here */
    .session-video {
        background: linear-gradient(180deg, #fffef7 50%, #f6f9ff 50%);
    }

    .sv-poster img,
    .sv-play {
        transition: none;
    }

    .sv-poster:hover img {
        transform: none;
    }
}
</style>
