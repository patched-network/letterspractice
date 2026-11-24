# Arpabet Phoneme Reference

Arpabet is the phonetic alphabet used by CMUDict. Each phoneme is represented by 1-2 uppercase letters, with optional stress markers on vowels.

## Vowels (15 phonemes)

Vowels carry **stress markers** (0, 1, 2) in CMUDict transcriptions.

### Monophthongs (pure vowels)

| Arpabet | IPA | Example | As in |
|---------|-----|---------|-------|
| AA | ɑ | AA1 | f**a**ther, b**o**t |
| AE | æ | AE1 | c**a**t, b**a**t |
| AH | ʌ/ə | AH0, AH1 | b**u**t, **a**bout (schwa when unstressed) |
| AO | ɔ | AO1 | c**au**ght, l**aw**, **a**ll |
| EH | ɛ | EH1 | b**e**t, r**e**d |
| ER | ɝ/ɚ | ER1 | b**ir**d, h**er** (r-colored) |
| IH | ɪ | IH1 | b**i**t, s**i**t |
| IY | i | IY1 | b**ea**t, s**ee** |
| UH | ʊ | UH1 | b**oo**k, p**u**t |
| UW | u | UW1 | b**oo**t, bl**ue** |

### Diphthongs (gliding vowels)

| Arpabet | IPA | Example | As in |
|---------|-----|---------|-------|
| AW | aʊ | AW1 | h**ou**se, n**ow** |
| AY | aɪ | AY1 | b**i**te, m**y** |
| EY | eɪ | EY1 | b**ai**t, d**ay** |
| OW | oʊ | OW1 | b**oa**t, g**o** |
| OY | ɔɪ | OY1 | b**oy**, t**oy** |

### Stress Markers

Stress is marked with digits **only on vowels**:

| Marker | Meaning | Example |
|--------|---------|---------|
| 1 | Primary stress | "about" = AH0 B **AW1** T |
| 2 | Secondary stress | "eighteen" = **EY2** T IY1 N |
| 0 | Unstressed | "**a**bout" = **AH0** B AW1 T |

**Note**: Our GPC pipeline strips stress markers (AY1 → AY) since English orthography doesn't encode stress.

### The Schwa (AH0)

When AH appears unstressed (AH0), it represents **schwa** (ə) — the most common vowel in English, appearing in unstressed syllables:

- "about" = AH0 B AW1 T (first vowel is schwa)
- "sofa" = S OW1 F AH0 (second vowel is schwa)
- "the" = DH AH0 (schwa — this is why "the" fails our alignment)

Schwa is highly reduced and can represent almost any written vowel in unstressed position. This makes it a major source of spelling irregularity.

## Consonants (24 phonemes)

### Stops (plosives)

| Arpabet | IPA | Example | Voiced? |
|---------|-----|---------|---------|
| P | p | **p**at | No |
| B | b | **b**at | Yes |
| T | t | **t**ap | No |
| D | d | **d**ab | Yes |
| K | k | **c**at, **k**it | No |
| G | g | **g**ot | Yes |

### Fricatives

| Arpabet | IPA | Example | Voiced? |
|---------|-----|---------|---------|
| F | f | **f**at | No |
| V | v | **v**at | Yes |
| TH | θ | **th**in | No |
| DH | ð | **th**is | Yes |
| S | s | **s**it | No |
| Z | z | **z**ip | Yes |
| SH | ʃ | **sh**ip | No |
| ZH | ʒ | mea**s**ure | Yes |
| HH | h | **h**at | No |

### Affricates

| Arpabet | IPA | Example | Voiced? |
|---------|-----|---------|---------|
| CH | tʃ | **ch**ip | No |
| JH | dʒ | **j**ump, bri**dge** | Yes |

### Nasals

| Arpabet | IPA | Example |
|---------|-----|---------|
| M | m | **m**at |
| N | n | **n**ap |
| NG | ŋ | si**ng** |

### Liquids

| Arpabet | IPA | Example |
|---------|-----|---------|
| L | l | **l**eft |
| R | r | **r**ed |

### Glides (semivowels)

| Arpabet | IPA | Example |
|---------|-----|---------|
| W | w | **w**et |
| Y | j | **y**es |

## Phoneme Inventory Summary

| Category | Count | Phonemes |
|----------|-------|----------|
| Monophthongs | 10 | AA, AE, AH, AO, EH, ER, IH, IY, UH, UW |
| Diphthongs | 5 | AW, AY, EY, OW, OY |
| Stops | 6 | P, B, T, D, K, G |
| Fricatives | 9 | F, V, TH, DH, S, Z, SH, ZH, HH |
| Affricates | 2 | CH, JH |
| Nasals | 3 | M, N, NG |
| Liquids | 2 | L, R |
| Glides | 2 | W, Y |
| **Total** | **39** | |

## CMUDict Conventions

### Multi-word entries
Some entries have variant pronunciations marked with (2), (3), etc.:
```
live  L IH1 V      (verb: "to live")
live(2)  L AY1 V   (adjective: "live wire")
```

### No phoneme for silent letters
Silent letters have no phoneme:
```
knight  N AY1 T    (no K phoneme)
write   R AY1 T    (no W phoneme)
```

### Syllabic consonants
CMUDict doesn't mark syllabic consonants explicitly. Words like "button" are transcribed:
```
button  B AH1 T AH0 N   (not B AH1 T N̩)
```

## Dialectal Variation

CMUDict represents **General American English**. Notable variations:

| Feature | CMUDict | Other dialects |
|---------|---------|----------------|
| Cot-caught merger | AA ≠ AO | Many Americans merge these |
| R-coloring | Always present | Non-rhotic dialects drop final R |
| Mary-marry-merry | Often merged | Some dialects distinguish all three |

## Mapping to GPC Catalogue

Our GPC catalogue maps graphemes to Arpabet phonemes:

```json
"a": ["AE"]           // short-a: cat
"a_e": ["EY"]         // magic-e: cake
"all": ["AO L"]       // l-controlled: ball (multi-phoneme)
"th": ["TH", "DH"]    // unvoiced/voiced: thin/this
```

Multi-phoneme sequences use space separation in the catalogue (`"AO L"`) and underscore in GPC IDs (`GPC-all-AO_L`).

## References

- [CMUDict](http://www.speech.cs.cmu.edu/cgi-bin/cmudict) — Carnegie Mellon Pronouncing Dictionary
- [Arpabet on Wikipedia](https://en.wikipedia.org/wiki/ARPABET)
- [IPA Chart](https://www.internationalphoneticassociation.org/content/ipa-chart)
