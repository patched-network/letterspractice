import { describe, expect, it } from 'vitest';
import { LANDING_CTAS, LANDING_SECTIONS, VIDEO_QUARTILES, landingEvent } from './landingEvents';

// GoatCounter keys its history by these names; renaming one splits the series.
// If this test fails, you renamed or removed an event. Add a new name instead,
// or update this list knowing the old series stops here.
describe('landing event names', () => {
  it('are stable', () => {
    const names = [
      ...LANDING_SECTIONS.map(landingEvent.seen),
      ...LANDING_CTAS.map(landingEvent.cta),
      landingEvent.videoPlay,
      ...VIDEO_QUARTILES.map(landingEvent.videoQuartile),
      landingEvent.signupSubmit,
    ];
    expect(names).toEqual([
      'seen:hero',
      'seen:under-the-hood',
      'seen:video',
      'seen:walkthrough',
      'seen:mission',
      'seen:footer',
      'cta:hero-peek',
      'cta:hero-study',
      'cta:hero-resume',
      'cta:hero-sample',
      'cta:fridge-sheet',
      'cta:exercises',
      'cta:curriculum',
      'cta:learning-engine',
      'video-play',
      'video-25',
      'video-50',
      'video-75',
      'video-100',
      'signup-submit',
    ]);
  });
});
