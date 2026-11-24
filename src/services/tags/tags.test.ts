/**
 * Tag Utility Module — Tests
 *
 * Run with: npx vitest run src/services/tags/tags.test.ts
 *
 * Covers gpcTags, conceptTags, and questionTags utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  gpcTag,
  gpcShortId,
  tagToGpcId,
  tagRole,
  isGpcTag,
  graphemeToGpcId,
  getGpcEntry,
  type GpcRole,
} from './gpcTags';

import {
  conceptTagsForGpc,
  conceptTagsForFields,
  CONCEPT_TAGS,
  CONCEPT_TAG_SET,
} from './conceptTags';

import {
  tagSpellingQuestion,
  tagWhoSaidThat,
  tagWordSelection,
  tagVignette,
  UI_TAG_SPELLING,
  UI_TAG_WHO_SAID_THAT,
  UI_TAG_WORD_SELECTION,
  UI_TAG_VIGNETTE,
} from './questionTags';

// ---------------------------------------------------------------------------
// gpcTags.ts
// ---------------------------------------------------------------------------

describe('gpcShortId', () => {
  it('strips GPC- prefix', () => expect(gpcShortId('GPC-sh-SH')).toBe('sh-SH'));
  it('handles split digraph', () => expect(gpcShortId('GPC-a_e-EY')).toBe('a_e-EY'));
  it('handles multi-phoneme', () => expect(gpcShortId('GPC-x-K_S')).toBe('x-K_S'));
  it('handles sight words', () => expect(gpcShortId('GPC-WORD-the')).toBe('WORD-the'));
  it('idempotent when already stripped', () => expect(gpcShortId('sh-SH')).toBe('sh-SH'));
  it('handles position suffix', () => expect(gpcShortId('GPC-e-IY-final')).toBe('e-IY-final'));
});

describe('gpcTag', () => {
  it('exercise tag from full ID', () => expect(gpcTag('exercise', 'GPC-sh-SH')).toBe('gpc:exercise:sh-SH'));
  it('intro tag', () => expect(gpcTag('intro', 'GPC-sh-SH')).toBe('gpc:intro:sh-SH'));
  it('expose tag', () => expect(gpcTag('expose', 'GPC-sh-SH')).toBe('gpc:expose:sh-SH'));
  it('works with short ID', () => expect(gpcTag('exercise', 'sh-SH')).toBe('gpc:exercise:sh-SH'));
  it('multi-phoneme', () => expect(gpcTag('exercise', 'GPC-x-K_S')).toBe('gpc:exercise:x-K_S'));
  it('sight word', () => expect(gpcTag('exercise', 'GPC-WORD-the')).toBe('gpc:exercise:WORD-the'));
});

describe('tagToGpcId — round-trip', () => {
  const ids = [
    'GPC-sh-SH', 'GPC-a_e-EY', 'GPC-x-K_S', 'GPC-WORD-the',
    'GPC-s-S', 'GPC-e-IY-final', 'GPC-nk-NG_K',
  ];

  for (const id of ids) {
    it(`round-trips ${id}`, () => {
      const tag = gpcTag('exercise', id);
      expect(tagToGpcId(tag)).toBe(id);
    });
  }

  for (const role of ['intro', 'exercise', 'expose'] as GpcRole[]) {
    it(`tagRole extracts "${role}"`, () => {
      const tag = gpcTag(role, 'GPC-sh-SH');
      expect(tagRole(tag)).toBe(role);
    });
  }
});

describe('tagToGpcId — invalid inputs', () => {
  it('rejects non-tag string', () => expect(tagToGpcId('not-a-tag')).toBeNull());
  it('rejects invalid role', () => expect(tagToGpcId('gpc:invalid:sh-SH')).toBeNull());
  it('rejects concept tag', () => expect(tagToGpcId('concept:match:simple')).toBeNull());
  it('rejects empty string', () => expect(tagToGpcId('')).toBeNull());
});

describe('tagRole — invalid inputs', () => {
  it('rejects non-tag string', () => expect(tagRole('not-a-tag')).toBeNull());
  it('rejects concept tag', () => expect(tagRole('concept:match:simple')).toBeNull());
});

describe('isGpcTag', () => {
  it('recognises exercise tag', () => expect(isGpcTag('gpc:exercise:sh-SH')).toBe(true));
  it('recognises intro tag', () => expect(isGpcTag('gpc:intro:a_e-EY')).toBe(true));
  it('recognises expose tag', () => expect(isGpcTag('gpc:expose:x-K_S')).toBe(true));
  it('rejects concept tag', () => expect(isGpcTag('concept:match:simple')).toBe(false));
  it('rejects UI tag', () => expect(isGpcTag('ui:spelling')).toBe(false));
  it('rejects empty string', () => expect(isGpcTag('')).toBe(false));
  it('rejects invalid role', () => expect(isGpcTag('gpc:invalid:sh-SH')).toBe(false));
});

describe('graphemeToGpcId', () => {
  it('digraph exact match', () => expect(graphemeToGpcId('sh', 'SH')).toBe('GPC-sh-SH'));
  it('simple consonant', () => expect(graphemeToGpcId('s', 'S')).toBe('GPC-s-S'));
  it('multi-phoneme', () => expect(graphemeToGpcId('x', 'K S')).toBe('GPC-x-K_S'));
  it('voiceless th', () => expect(graphemeToGpcId('th', 'TH')).toBe('GPC-th-TH'));
  it('voiced th', () => expect(graphemeToGpcId('th', 'DH')).toBe('GPC-th-DH'));
  it('short vowel', () => expect(graphemeToGpcId('a', 'AE')).toBe('GPC-a-AE'));
  it('returns null for unknown grapheme', () => expect(graphemeToGpcId('zzz', 'ZZZ')).toBeNull());
});

describe('getGpcEntry', () => {
  it('finds sh-SH entry', () => {
    const entry = getGpcEntry('GPC-sh-SH');
    expect(entry).toBeDefined();
    expect(entry?.grapheme).toBe('sh');
    expect(entry?.phoneme).toBe('SH');
    expect(entry?.category).toBe('digraphs');
  });

  it('returns undefined for unknown ID', () => {
    expect(getGpcEntry('GPC-zzz-ZZZ')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// conceptTags.ts
// ---------------------------------------------------------------------------

describe('conceptTagsForGpc', () => {
  it('sh → digraph concept', () => {
    const entry = getGpcEntry('GPC-sh-SH')!;
    expect(conceptTagsForGpc(entry)).toContain('concept:match:digraph');
  });

  it('s → simple concept', () => {
    const entry = getGpcEntry('GPC-s-S')!;
    expect(conceptTagsForGpc(entry)).toContain('concept:match:simple');
  });

  it('a_e → split_digraph concept', () => {
    const entry = getGpcEntry('GPC-a_e-EY')!;
    expect(conceptTagsForGpc(entry)).toContain('concept:match:split_digraph');
  });

  it('i → short vowel concept', () => {
    const entry = getGpcEntry('GPC-i-IH')!;
    expect(conceptTagsForGpc(entry)).toContain('concept:vowel:short');
  });
});

describe('conceptTagsForFields', () => {
  it('consonants + simple → concept:match:simple', () => {
    expect(conceptTagsForFields('consonants', 'simple')).toContain('concept:match:simple');
  });

  it('soft consonant concept', () => {
    expect(conceptTagsForFields('consonants_soft', 'context_before')).toContain('concept:consonant:soft');
  });

  it('no duplicates when category and matchType map to same concept', () => {
    const result = conceptTagsForFields('consonants_soft', 'context_before');
    const softCount = result.filter(t => t === 'concept:consonant:soft').length;
    expect(softCount).toBe(1);
  });
});

describe('CONCEPT_TAGS registry', () => {
  it('has at least 17 concept tags', () => expect(CONCEPT_TAGS.length).toBeGreaterThanOrEqual(17));
  it('set contains concept:match:simple', () => expect(CONCEPT_TAG_SET.has('concept:match:simple')).toBe(true));
  it('set contains concept:skill:blending', () => expect(CONCEPT_TAG_SET.has('concept:skill:blending')).toBe(true));
  it('set does not contain GPC tags', () => expect((CONCEPT_TAG_SET as ReadonlySet<string>).has('gpc:exercise:sh-SH')).toBe(false));
});

// ---------------------------------------------------------------------------
// questionTags.ts
// ---------------------------------------------------------------------------

describe('tagSpellingQuestion', () => {
  it('"sit" has correct tags', () => {
    const tags = tagSpellingQuestion('sit');
    expect(tags).toContain(UI_TAG_SPELLING);
    expect(tags).toContain('concept:skill:blending');
    expect(tags).toContain('concept:skill:segmenting');
    expect(tags).toContain('gpc:exercise:s-S');
    expect(tags).toContain('gpc:exercise:i-IH');
    expect(tags).toContain('gpc:exercise:t-T');
    expect(tags).toContain('concept:match:simple');
    expect(tags).toContain('concept:vowel:short');
  });

  it('"sit" tags have no duplicates', () => {
    const tags = tagSpellingQuestion('sit');
    expect(tags.length).toBe(new Set(tags).size);
  });

  it('unknown word falls back to UI tag only', () => {
    const tags = tagSpellingQuestion('xyzzyplugh');
    expect(tags).toContain(UI_TAG_SPELLING);
    expect(tags.length).toBe(1);
  });
});

describe('tagWhoSaidThat', () => {
  it('sh-SH vs distractors', () => {
    const tags = tagWhoSaidThat('GPC-sh-SH', ['GPC-s-S', 'GPC-ch-CH']);
    expect(tags).toContain(UI_TAG_WHO_SAID_THAT);
    expect(tags).toContain('gpc:exercise:sh-SH');
    expect(tags).toContain('gpc:expose:s-S');
    expect(tags).toContain('gpc:expose:ch-CH');
    expect(tags).toContain('concept:match:digraph');
    expect(tags).not.toContain('gpc:exercise:s-S');
  });

  it('no duplicates', () => {
    const tags = tagWhoSaidThat('GPC-sh-SH', ['GPC-s-S', 'GPC-ch-CH']);
    expect(tags.length).toBe(new Set(tags).size);
  });

  it('no distractors', () => {
    const tags = tagWhoSaidThat('GPC-s-S', []);
    expect(tags).toContain(UI_TAG_WHO_SAID_THAT);
    expect(tags).toContain('gpc:exercise:s-S');
    expect(tags.filter(t => t.startsWith('gpc:expose:')).length).toBe(0);
  });
});

describe('tagWordSelection', () => {
  it('"sit" vs "bit" — differ at position 0', () => {
    const tags = tagWordSelection('sit', ['bit']);
    expect(tags).toContain(UI_TAG_WORD_SELECTION);
    expect(tags).toContain('concept:skill:first-phoneme-diff');
    expect(tags).toContain('gpc:exercise:s-S');
    expect(tags).toContain('gpc:expose:i-IH');
    expect(tags).toContain('gpc:expose:t-T');
    expect(tags).toContain('gpc:expose:b-B');
  });

  it('no duplicates', () => {
    const tags = tagWordSelection('sit', ['bit']);
    expect(tags.length).toBe(new Set(tags).size);
  });

  it('unknown target falls back to UI tag only', () => {
    const tags = tagWordSelection('xyzzyplugh', ['sit']);
    expect(tags).toContain(UI_TAG_WORD_SELECTION);
    expect(tags.length).toBe(1);
  });
});

describe('tagVignette', () => {
  it('introduces GPCs without exercising them', () => {
    const tags = tagVignette(['GPC-sh-SH', 'GPC-ch-CH']);
    expect(tags).toContain(UI_TAG_VIGNETTE);
    expect(tags).toContain('gpc:intro:sh-SH');
    expect(tags).toContain('gpc:intro:ch-CH');
    expect(tags).toContain('concept:match:digraph');
    expect(tags).not.toContain('gpc:exercise:sh-SH');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: tag namespace isolation
// ---------------------------------------------------------------------------

describe('Tag namespace isolation', () => {
  it('spelling questions have no expose tags', () => {
    const tags = tagSpellingQuestion('sit');
    expect(tags.filter(t => t.startsWith('gpc:expose:')).length).toBe(0);
  });

  it('spelling questions have no intro tags', () => {
    const tags = tagSpellingQuestion('sit');
    expect(tags.filter(t => t.startsWith('gpc:intro:')).length).toBe(0);
  });

  it('WST has exactly one exercise tag', () => {
    const tags = tagWhoSaidThat('GPC-s-S', ['GPC-t-T']);
    expect(tags.filter(t => t.startsWith('gpc:exercise:')).length).toBe(1);
  });
});
