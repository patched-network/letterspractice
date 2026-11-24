# Audio Assets

This directory contains audio files for the LettersPractice application.

## Structure

```
audio/
├── words/        # Complete word pronunciations
├── phonemes/     # Isolated phoneme sounds, by teaching name (cons_s, …)
└── arpa/         # Isolated phoneme sounds, by ARPAbet symbol (SH, AE, …)
```

## Development Setup

Audio files are **not committed here** (see `.gitignore`). They come from
the audio repo pinned in `audio.json` (CC BY-NC 4.0); `scripts/setup-audio.sh`
fetches them before `yarn dev`. If mp3 files are already present it skips.
See the root README § Audio.

To refresh: `AUDIO_FORCE=1 ./scripts/setup-audio.sh`.

## Production Deployment

Audio is not part of the build: a deployment serves it at `/audio/` from its own copy, alongside the app.

## Usage in Code

Reference audio files using relative URLs:
```typescript
const audioUrl = '/audio/words/fish.mp3';
const phonemeUrl = '/audio/phonemes/cons_s.mp3';
```

These paths work identically in development (served from `public/`) and production (served from symlinked directory).
