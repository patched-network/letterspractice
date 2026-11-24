> **STALE — illustrative transcript only.** Hand-pasted terminal capture of a
> `yarn gen:sequence` run on branch `alignment-decoding-v2`; `gen:sequence`
> does NOT regenerate this file (it writes only `gpc-sequence.json`, which is
> the source of truth). Known divergence from the current JSON: e.g. `wh-W`
> appears at step 12 here but sits at step 53 after the wh→silent-letters
> re-home. Read the JSON, or `agent/lessons-audit/a.1.lesson-slate-audit.md`
> for a current per-lesson view.

~/p/c/g/l/c/phoneticAnalytics (alignment-decoding-v2)$ yarn gen:sequence
Loading data...
Loaded 45361 words from corpus.
Using decode-based coverage (no pre-tagging required).

Initial known GPCs (4):
GPC-s-S, GPC-n-N, GPC-i-IH, GPC-t-T

Computing greedy sequence (decode-based)...

Step  GPC                  Added Freq  Words  Coverage%  Sample Words
-------------------------------------------------------------------------------------
   0  (initial: 4 GPCs)       1,490,915     17       3.3%  it, in, sit

>>> Step 1: Unlocking "Simple Consonants" (24 GPCs)

   1  GPC-s-Z                   460,524      5       4.3%  is, sins, tis
   2  GPC-f-F                   185,052     12       4.7%  if, fit, fits
   3  GPC-h-HH                  123,961      5       5.0%  his, hit, hits

>>> Step 4: Unlocking "Short Vowels" (11 GPCs)

   4  GPC-o-AA                  644,098     13       6.4%  on, not, hot
   5  GPC-a-AE                  453,505     33       7.4%  at, as, an
   6  GPC-m-M                   367,777     38       8.3%  him, man, am
   7  GPC-v-V                   320,771     14       9.0%  have, visit, van
   8  GPC-c-K                   309,836     75       9.7%  can, fact, act
   9  GPC-d-D                   292,031     61      10.3%  did, had, dad

>>> Step 10: Unlocking "Consonant Digraphs" (19 GPCs)

  10  GPC-th-DH               1,164,271      3      12.9%  that, this, than
  11  GPC-a-AH                  700,475     52      14.4%  and, admit, santa
  12  GPC-wh-W                  502,617      9      15.5%  what, whim, whats
  13  GPC-e-EH                  402,463    141      16.4%  when, them, then
  14  GPC-g-G                   540,700     81      17.6%  get, got, give

>>> Step 15: Unlocking "Sight Words" (59 GPCs)

  15  GPC-WORD-i              2,038,529      1      22.2%  i
  16  GPC-WORD-the            1,501,908      1      25.5%  the
  17  GPC-WORD-to             1,156,570      1      28.0%  to
  18  GPC-WORD-of               590,439      1      29.4%  of
  19  GPC-r-R                   375,336    196      30.2%  there, where, rest

>>> Step 20: Unlocking "Magic-E (Split Digraphs)" (6 GPCs)

  20  GPC-o-AO                  575,077    148      31.5%  for, or, more
  21  GPC-o-AH                  442,347    110      32.4%  come, from, some
  22  GPC-l-L                   437,707    401      33.4%  let, love, last
  23  GPC-w-W                   354,914     57      34.2%  with, won, went
  24  GPC-a-AA                  601,484    252      35.5%  was, want, car

>>> Step 25: Unlocking "Final Open Vowels" (8 GPCs)

  25  GPC-e-IY-final          1,322,953      6      38.5%  me, we, he
  26  GPC-o-OW-final            748,226     90      40.1%  no, so, go
  27  GPC-y-AY-final            495,790     16      41.2%  my, why, try
  28  GPC-b-B                   558,305    363      42.5%  be, by, big
  29  GPC-u-AH                  536,942    335      43.6%  but, us, must
  30  GPC-p-P                   527,869    720      44.8%  up, help, stop
  31  GPC-i_e-AY                368,216    186      45.6%  time, life, fine
  32  GPC-WORD-your             328,715      1      46.4%  your
  33  GPC-k-K                   326,713    225      47.1%  like, ask, kid
  34  GPC-a_e-EY                455,187    227      48.1%  take, make, name

>>> Step 35: Unlocking "Vowel Teams" (36 GPCs)

  35  GPC-ou-AW                 492,349    153      49.2%  out, about, house
  36  GPC-ee-IY                 462,116    247      50.2%  see, need, keep
  37  GPC-ow-AW                 432,067     82      51.2%  now, how, down
  38  GPC-ay-EY                 390,439    144      52.0%  say, way, day
  39  GPC-ea-IY                 370,287    223      52.8%  mean, please, leave
  40  GPC-ng-NG                 377,034    688      53.7%  long, coming, morning
  41  GPC-sh-SH                 343,375    334      54.4%  she, shit, shut
  42  GPC-oo-UH                 320,999    118      55.2%  good, look, looking
  43  GPC-WORD-do               312,915      1      55.8%  do
  44  GPC-ey-EY                 299,260     24      56.5%  they, hey, grey
  45  GPC-j-JH                  296,073     94      57.2%  just, job, jump
  46  GPC-ck-K                  294,877    378      57.8%  back, fuck, fucking
  47  GPC-e_e-IY                288,709     40      58.5%  here, these, steve
  48  GPC-WORD-are              265,672      1      59.1%  are
  49  GPC-th-TH                 237,420    170      59.6%  thing, nothing, things

>>> Step 50: Unlocking "R-Controlled Vowels" (24 GPCs)

  50  GPC-er-ER                 896,481   1392      61.6%  her, were, never
  51  GPC-nk-NG_K               305,169    190      62.2%  think, thank, thanks
  52  GPC-y-IY-final            267,130    550      62.8%  very, every, probably
  53  GPC-oo-UW                 210,809    368      63.3%  too, room, soon
  54  GPC-e-IH                  206,965    760      63.8%  before, remember, started

>>> Step 55: Unlocking "L-Controlled Vowels" (7 GPCs)

  55  GPC-all-AO_L              356,486     97      64.5%  all, call, small
  56  GPC-ch-CH                 206,992    368      65.0%  much, which, such
  57  GPC-or-ER                 199,953    318      65.4%  work, world, forget
  58  GPC-o_e-OW                185,418    193      65.9%  home, those, hope
  59  GPC-ea-EH                 175,805    206      66.2%  dead, ready, head
  60  GPC-ir-ER                 167,831    143      66.6%  sir, first, girl
  61  GPC-WORD-oh               167,781      1      67.0%  oh
  62  GPC-ai-EY                 166,059    388      67.4%  wait, afraid, waiting
  63  GPC-WORD-one              156,684      1      67.7%  one
  64  GPC-y-Y                   155,396     83      68.1%  yes, yet, ya

>>> Step 65: Unlocking "Soft C and G" (2 GPCs)

  65  GPC-ou-UW               2,146,648     51      72.8%  you, group, louis
  66  GPC-c-S-soft              223,387    429      73.3%  nice, place, since
  67  GPC-ai-EH                 151,295    106      73.6%  said, again, against
  68  GPC-ind-AY_N_D            121,102     59      73.9%  find, kind, mind
  69  GPC-ow-OW                 114,467    179      74.2%  show, own, throw
  70  GPC-WORD-who              113,370      1      74.4%  who
  71  GPC-old-OW_L_D            112,891     81      74.7%  told, old, hold
  72  GPC-x-K_S                 104,086    272      74.9%  next, six, sex
  73  GPC-ur-ER                  94,203    269      75.1%  turn, hurt, murder
  74  GPC-ie-IY                  91,131    329      75.3%  believe, piece, charlie

>>> Step 75: Unlocking "Doubled Consonants" (15 GPCs)

  75  GPC-ll-L                  610,146    632      76.7%  well, will, tell
  76  GPC-nn-N                  210,033    216      77.1%  gonna, wanna, funny
  77  GPC-tt-T                  206,103    420      77.6%  better, gotta, getting
  78  GPC-ss-S                  162,690    399      77.9%  miss, ass, boss
  79  GPC-ff-F                  129,679    236      78.2%  off, stuff, office

>>> Step 80: Unlocking "Silent Letter Patterns" (11 GPCs)

  80  GPC-kn-N-initial          323,784     46      78.9%  know, knows, known
  81  GPC-rr-R                  103,432    122      79.2%  sorry, tomorrow, carry
  82  GPC-g-JH-soft              96,508    348      79.4%  change, general, message
  83  GPC-WORD-would             90,162      1      79.6%  would
  84  GPC-WORD-been              88,573      1      79.8%  been

>>> Step 85: Unlocking "Trigraphs" (5 GPCs)

  85  GPC-igh-AY                367,458    157      80.6%  right, night, might
  86  GPC-alk-AO_K               87,943     36      80.8%  talk, talking, walk
  87  GPC-ew-UW                  85,726    102      81.0%  new, knew, news
  88  GPC-u-UH                   85,195    110      81.2%  put, full, pull
  89  GPC-WORD-could             83,109      1      81.4%  could

>>> Step 90: Unlocking "Latin/Greek Digraphs" (7 GPCs)

  90  GPC-ear-IH_R               83,010     80      81.5%  years, year, dear
  91  GPC-au-AO                  80,730    176      81.7%  because, fault, paul
  92  GPC-ar-ER                  78,633    199      81.9%  around, dollars, richard
  93  GPC-ey-IY                  78,338    130      82.1%  money, honey, key
  94  GPC-gu-G                   77,282     44      82.2%  guy, guess, guilty
  95  GPC-are-EH_R               66,714     97      82.4%  care, scared, careful
  96  GPC-tch-CH                 61,491    144      82.5%  watch, bitch, catch
  97  GPC-oy-OY                  60,915    111      82.7%  boy, boys, enjoy
  98  GPC-ea-EY                  60,118     34      82.8%  great, break, breaking
  99  GPC-WORD-mr                60,098      1      82.9%  mr

>>> Step 100: Unlocking "Extended Diphthongs (ough, augh)" (9 GPCs)

 100  GPC-ti-SH                  58,757    338      83.1%  attention, position, action
 101  GPC-ough-AO                57,877     11      83.2%  thought, brought, ought
 102  GPC-WORD-any               56,068      1      83.3%  any
 103  GPC-pp-P                   55,854    261      83.4%  happy, suppose, support
 104  GPC-ie-AY                  56,538     75      83.6%  die, tried, died
 105  GPC-WORD-only              55,269      1      83.7%  only
 106  GPC-WORD-two               54,384      1      83.8%  two
 107  GPC-WORD-should            54,159      1      83.9%  should
 108  GPC-oa-OW                  51,688    230      84.0%  whoa, road, boat
 109  GPC-aw-AO                  49,706    145      84.1%  saw, law, lawyer

>>> Step 110: Unlocking "Syllabic Consonants (-le, -el)" (8 GPCs)

 110  GPC-en-AH_N               167,289    594      84.5%  happen, aren, different
 111  GPC-le-AH_L               144,799    373      84.8%  little, able, handle
 112  GPC-ou-AH                  67,356    116      85.0%  young, trouble, couple
 113  GPC-dd-D                   55,034    184      85.1%  daddy, kidding, buddy
 114  GPC-mm-M                   50,085    205      85.2%  hmm, jimmy, summer
 115  GPC-oi-OY                  49,812    177      85.3%  point, choice, voice
 116  GPC-our-AO_R               49,529     44      85.4%  course, four, court
 117  GPC-gh-                    49,145     42      85.5%  through, daughter, straight
 118  GPC-ear-ER                 46,460     56      85.6%  heard, learn, early
 119  GPC-wr-R-initial           43,747     52      85.7%  wrong, write, wrote
 120  GPC-qu-K_W                 41,702    179      85.8%  quite, quick, quit
 121  GPC-ire-AY_ER              37,404     72      85.9%  fire, tired, entire
 122  GPC-WORD-does              34,002      1      86.0%  does
 123  GPC-el-AH_L                33,942    224      86.1%  level, travel, model
 124  GPC-WORD-their             33,413      1      86.1%  their
 125  GPC-gh-F                   32,743     17      86.2%  enough, tough, rough
 126  GPC-in-AH_N                32,292    184      86.3%  imagine, cousin, martin
 127  GPC-u_e-Y_UW               30,816     51      86.4%  excuse, cute, huge
 128  GPC-z-Z                    30,680    235      86.4%  apologize, size, recognize
 129  GPC-ch-K                   29,558    131      86.5%  school, stomach, technology
 130  GPC-i-AY-final             29,421     13      86.6%  hi, chi, pi
 131  GPC-u_e-UW                 27,420     82      86.6%  dude, luke, rule
 132  GPC-ue-UW                  27,360     61      86.7%  true, blue, due
 133  GPC-our-ER                 26,862     33      86.7%  yourself, courage, journey
 134  GPC-ph-F                   26,645    146      86.8%  phone, phil, christopher
 135  GPC-oor-AO_R               23,671     20      86.8%  door, floor, doors
 136  GPC-x-G_Z                  21,467     47      86.9%  exactly, example, exist
 137  GPC-mn-M                   21,374     10      86.9%  damn, goddamn, column
 138  GPC-gg-G                   21,264    163      87.0%  bigger, eggs, maggie
 139  GPC-ci-SH                  18,938     62      87.0%  special, official, precious
 140  GPC-WORD-many              18,331      1      87.1%  many
 141  GPC-ou-OW                  18,312     37      87.1%  though, soul, shoulder
 142  GPC-ew-Y_UW                17,662     25      87.2%  few, nephew, ewing
 143  GPC-WORD-once              17,589      1      87.2%  once
 144  GPC-bb-B                   16,393    151      87.2%  bobby, robbery, rubber
 145  GPC-WORD-says              16,356      1      87.3%  says
 146  GPC-WORD-mrs               15,858      1      87.3%  mrs
 147  GPC-ei-EY                  15,495     62      87.3%  eight, neighborhood, weight
 148  GPC-ei-IY                  15,372     27      87.4%  either, neither, ceiling
 149  GPC-ild-AY_L_D             13,170     30      87.4%  child, wild, childhood
 150  GPC-dge-JH                 12,887     72      87.4%  judge, bridge, edge
 151  GPC-au-AE                  11,223     12      87.5%  laugh, aunt, laughing
 152  GPC-ue-Y_UW                10,777     41      87.5%  continue, rescue, value
 153  GPC-cc-K                    9,900     68      87.5%  account, according, soccer
 154  GPC-mb-M                    9,933     40      87.5%  bomb, dumb, bombs
 155  GPC-si-ZH                   8,443     51      87.5%  decision, vision, division
 156  GPC-oar-AO_R                7,864     62      87.6%  board, aboard, boarding
 157  GPC-oll-OW_L                7,629     51      87.6%  roll, rolling, rolls
 158  GPC-i-IY-final              7,360     91      87.6%  taxi, li, lori
 159  GPC-alt-AO_L_T              6,934     42      87.6%  walter, salt, walt
 160  GPC-sc-S                    6,657     69      87.6%  scene, muscle, scent
 161  GPC-ore-AO_R                6,084     89      87.6%  bored, stores, scores
 162  GPC-bt-T                    5,499     15      87.6%  doubt, debt, subtle
 163  GPC-ure-Y_UH_R              5,295     26      87.7%  pure, secure, cure
 164  GPC-zz-Z                    4,522     55      87.7%  buzz, jazz, dizzy
 165  GPC-ch-SH                   3,756     34      87.7%  charlotte, chef, michigan
 166  GPC-ie-IH                   3,061     28      87.7%  pierce, pier, fierce
 167  GPC-ei-AY                   2,961     39      87.7%  height, heights, frankenstein
 168  GPC-WORD-ms                 2,599      1      87.7%  ms
 169  GPC-ire-AY_R                2,532     30      87.7%  retired, vampires, fireworks
 170  GPC-si-SH                   2,514     28      87.7%  tension, mansion, extension
 171  GPC-eu-UW                   1,571     31      87.7%  zeus, neutral, deuce
 172  GPC-eu-Y_UW                 1,010     21      87.7%  eugene, cheung, eulogy
 173  GPC-sch-SH                    798     30      87.7%  schmuck, schizophrenic, schneider
 174  GPC-ure-ER                    630      8      87.7%  injured, leisurely, perjured
 175  GPC-ew-OW                     544      3      87.7%  sew, sewing, sewn
 176  GPC-WORD-jr                   454      1      87.7%  jr
 177  GPC-q-K                       351      7      87.7%  que, iraq, barbeque
 178  GPC-gu-G_W                    335     10      87.7%  jaguar, nicaragua, guam
 179  GPC-WORD-sr                   254      1      87.7%  sr
 180  GPC-ough-AO_F                 229      3      87.7%  coughs, trough, troughs
 181  GPC-gn-N-initial              181      9      87.7%  gnarly, gnome, gnat
 182  GPC-rh-R-initial              156      8      87.7%  rhetorical, rhine, rhapsody
 183  GPC-ure-UH_R                   97      2      87.7%  lured, lures
 184  GPC-ps-S-initial               83      4      87.7%  psalm, psi, psalms
 185  GPC-x-Z                        56      4      87.7%  xerox, xenophobic, xeroxing
 186  GPC-pn-N-initial               31      2      87.7%  pneumatic, pneumonic
 187  GPC-zz-T_S                     28      1      87.7%  mozzarella

Final coverage: 87.7%
Words decodable: 23334
Unused GPCs: 60
  GPC-ng-N_G, GPC-ng-N_JH, GPC-wh-HH_W, GPC-sc-S_K, GPC-WORD-a, GPC-WORD-you, GPC-WORD-my, GPC-WORD-was, GPC-WORD-were, GPC-WORD-done, GPC-WORD-have, GPC-WORD-give, GPC-WORD-live, GPC-WORD-said, GPC-WORD-what, GPC-WORD-where, GPC-WORD-they, GPC-WORD-four, GPC-WORD-eight, GPC-WORD-some, GPC-WORD-come, GPC-WORD-love, GPC-WORD-none, GPC-WORD-from, GPC-WORD-son, GPC-WORD-won, GPC-WORD-there, GPC-WORD-here, GPC-WORD-other, GPC-WORD-put, GPC-WORD-push, GPC-WORD-pull, GPC-WORD-full, GPC-WORD-bull, GPC-WORD-dr, GPC-WORD-ms, GPC-a-AH-final, GPC-a-AE-final, GPC-ar-AA_R, GPC-or-AO_R, GPC-ear-EH_R, GPC-air-EH_R, GPC-our-AW_R, GPC-oor-UH_R, GPC-cc-K_S, GPC-sch-S_K, GPC-su-SH, GPC-su-ZH, GPC-tu-CH, GPC-ough-OW, GPC-ough-UW, GPC-ough-AH_F, GPC-augh-AO, GPC-augh-AE_F, GPC-eigh-EY, GPC-eigh-AY, GPC-al-AH_L, GPC-on-AH_N, GPC-an-AH_N, GPC-om-AH_M


Coverage plateau detected at step 2
  Coverage at plateau: 4.32%

============================================================
CATEGORY BREAKDOWN
============================================================

  other                  1 GPCs     1,490,915 freq  first at step 0
  single_consonants     30 GPCs    11,018,909 freq  first at step 1
  other_vowels          18 GPCs     4,555,168 freq  first at step 4
  short_vowels          13 GPCs     3,557,631 freq  first at step 5
  consonant_digraphs    98 GPCs    12,574,444 freq  first at step 10
  split_digraphs         6 GPCs     1,355,766 freq  first at step 31
  long_vowels           22 GPCs     5,032,697 freq  first at step 36

============================================================
TOP 20 UNCOVERED WORDS (by frequency)
============================================================

Rank  Word                Frequency
---------------------------------------------
   1  yeah                    152,262
   2  going                   108,288
   3  okay                    102,320
   4  really                   76,508
   5  something                76,508
   6  our                      71,425
   7  over                     67,488
   8  people                   56,252
   9  sure                     56,091
  10  doing                    52,492
  11  maybe                    47,249
  12  anything                 46,270
  13  even                     44,672
  14  into                     43,074
  15  uh                       36,579
  16  always                   33,418
  17  everything               33,399
  18  guys                     32,198
  19  hello                    29,857
  20  listen                   27,784

============================================================
Running time: 711.49s
============================================================

============================================================
SAVING OUTPUTS
============================================================
  → gpc-sequence.json

Done!
