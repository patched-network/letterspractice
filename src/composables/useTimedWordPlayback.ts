import { ref, type Ref } from 'vue';

/**
 * Effect types that can be applied to letters during phonetic chunk playback.
 * Defined here (canonical) and re-exported from PhoneticWord.vue for backwards compat.
 */
export type LetterEffect = 'speak' | 'highlight' | 'bounce' | 'glow' | 'silent-e' | 'r-control' | 'l-control';

/**
 * Timing marker for synchronizing letter animations with word audio.
 */
export interface SpeakerTiming {
    /** Letter index to animate */
    index: number;
    /** Milliseconds from audio start to trigger animation */
    time: number;
    /** Optional effect override (defaults to 'speak') */
    effect?: LetterEffect;
}

export interface PlayTimedWordOptions {
  audio: HTMLAudioElement;
  audioUrl: string | string[];
  timings: SpeakerTiming[];
  onTrigger: (timing: SpeakerTiming) => void;
}

export interface TimedWordPlayback {
  isPlaying: Ref<boolean>;
  play(opts: PlayTimedWordOptions): Promise<void>;
  stop(): void;
}

export function useTimedWordPlayback(): TimedWordPlayback {
  const isPlaying = ref(false);

  // Stash the most recent audio element so stop() can act on it without re-passing
  let currentAudio: HTMLAudioElement | null = null;
  let pendingTimings: ReturnType<typeof setTimeout>[] = [];
  // Settles the in-flight play() promise + detaches its listeners.
  // Single source of truth so every exit path (ended, error, play() rejection,
  // external stop()) tears down the same way.
  let currentSettle: (() => void) | null = null;

  const clearPending = (): void => {
    for (const t of pendingTimings) {
      clearTimeout(t);
    }
    pendingTimings = [];
  };

  const play = async (opts: PlayTimedWordOptions): Promise<void> => {
    if (isPlaying.value || !opts.audio) return;

    isPlaying.value = true;
    currentAudio = opts.audio;

    // Select audio URL (random if array)
    const audioUrl = Array.isArray(opts.audioUrl)
      ? opts.audioUrl[Math.floor(Math.random() * opts.audioUrl.length)]
      : opts.audioUrl;

    opts.audio.src = audioUrl;

    // Schedule letter animations once sound is actually coming out. Timings
    // are offsets into the recording; counted from here instead, a cold fetch
    // would run every letter ahead of its sound by the download time.
    const scheduleTimings = (offsetMs: number): void => {
      for (const timing of opts.timings) {
        const timeout = setTimeout(() => {
          opts.onTrigger(timing);
        }, Math.max(0, timing.time - offsetMs));
        pendingTimings.push(timeout);
      }
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const audio = opts.audio;

        const cleanup = () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          if (currentSettle === settle) currentSettle = null;
        };
        const onEnded = () => {
          cleanup();
          resolve();
        };
        const onError = (e: Event) => {
          cleanup();
          reject(e);
        };
        // Invoked by stop(): resolve cleanly so the consumer's finally still runs.
        const settle = () => {
          cleanup();
          resolve();
        };
        currentSettle = settle;

        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        audio.play().then(
          () => {
            // Already ended / errored / stopped: nothing left to animate.
            if (currentSettle !== settle) return;
            scheduleTimings(audio.currentTime * 1000);
          },
          (err) => {
            cleanup();
            reject(err);
          },
        );
      });
    } catch (error) {
      console.error('Failed to play word audio:', error);
    } finally {
      clearPending();
      isPlaying.value = false;
    }
  };

  const stop = (): void => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    clearPending();
    currentSettle?.();
    isPlaying.value = false;
  };

  return { isPlaying, play, stop };
}
