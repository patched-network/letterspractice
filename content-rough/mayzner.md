# English Letter Frequency Counts: Mayzner Revisited
## or ETAOIN SRHLDCU

## Introduction

On December 17th 2012, I got a nice letter from [Mark Mayzner](http://www.researchgate.net/profile/Mark_Mayzner/), a retired 85-year-old researcher who studied the frequency of letter combinations in English words in the early 1960s. His [1965 publication](http://books.google.com/books/about/Tables_of_Single_letter_and_Digram_Frequ.html?id=FI7BHgAACAAJ) has been cited in hundreds of articles. Mayzner describes his work:

> I culled a corpus of 20,000 words from a variety of sources, e.g., newspapers, magazines, books, etc. For each source selected, a starting place was chosen at random. In proceeding forward from this point, all three, four, five, six, and seven-letter words were recorded until a total of 200 words had been selected. This procedure was duplicated 100 times, each time with a different source, thus yielding a grand total of 20,000 words. This sample broke down as follows: three-letter words, 6,807 tokens, 187 types; four-letter words, 5,456 tokens, 641 types; five-letter words, 3,422 tokens, 856 types; six-letter words, 2,264 tokens, 868 types; seven-letter words, 2,051 tokens, 924 types. I then proceeded to construct tables that showed the frequency counts for three, four, five, six, and seven-letter words, but most importantly, broken down by word length and letter position, which had never been done before to my knowledge.

and he wonders if:

> perhaps your group at Google might be interested in using the computing power that is now available to significantly expand and produce such tables as I constructed some 50 years ago, but now using the Google Corpus Data, not the tiny 20,000 word sample that I used.

The answer is: yes indeed, I am interested! And it will be a lot easier for me than it was for Mayzner. Working 60s-style, Mayzner had to gather his collection of text sources, then go through them and select individual words, punch them on [Hollerith cards](http://www.masswerk.at/google60/?q=letter+frequency+tables+mayzner&mode=web), and use a [card-sorting machine](http://en.wikipedia.org/wiki/IBM_card_sorter).

Here's what we can do with today's computing power (using publicly available data and the processing power of my own personal computer; I'm not relying on access to corporate computing power):

1. I consulted the [Google books Ngrams](http://storage.googleapis.com/books/ngrams/books/datasetsv2.html) raw data set, which gives word counts of the number of times each word is mentioned (broken down by year of publication) in the books that have been scanned by Google.

2. I downloaded the English Version 20120701 "1-grams" (that is, word counts) from that data set given as the files "a" to "z" (that is, http://storage.googleapis.com/books/ngrams/books/googlebooks-eng-all-1gram-20120701-a.gz to http://storage.googleapis.com/books/ngrams/books/googlebooks-eng-all-1gram-20120701-z.gz). I unzipped each file; the result is 23 GB of text (so don't try to download them on your phone).

3. I then condensed these entries, combining the counts for all years, and for different capitalizations: "word", "Word" and "WORD" were all recorded under "WORD". I discarded any entry that used a character other than the 26 letters A-Z. I also discarded any word with fewer than 100,000 mentions. (If you want you can download the [word count file](google-books-common-words.txt); note that it is 1.5 MB.)

4. I generated tables of counts, first for words, then for letters and letter sequences, keyed off of the positions and word lengths.

## Word Counts

My distillation of the Google books data gives us 97,565 distinct words, which were mentioned 743,842,922,321 times (37 million times more than in Mayzner's 20,000-mention collection). Each distinct word is called a "type" and each mention is called a "token." To no surprise, the most common word is "the". Here are the top 50 words, with their counts (in billions of mentions) and their overall percentage:

| Word | Count (B) | Percent |
|------|-----------|---------|
| the | 53.10 | 7.14% |
| of | 30.97 | 4.16% |
| and | 22.63 | 3.04% |
| to | 19.35 | 2.60% |
| in | 16.89 | 2.27% |
| a | 15.31 | 2.06% |
| is | 8.38 | 1.13% |
| that | 8.00 | 1.08% |
| for | 6.55 | 0.88% |
| it | 5.74 | 0.77% |
| as | 5.70 | 0.77% |
| was | 5.50 | 0.74% |
| with | 5.18 | 0.70% |
| be | 4.82 | 0.65% |
| by | 4.70 | 0.63% |
| on | 4.59 | 0.62% |
| not | 4.52 | 0.61% |
| he | 4.11 | 0.55% |
| i | 3.88 | 0.52% |
| this | 3.83 | 0.51% |
| are | 3.70 | 0.50% |
| or | 3.67 | 0.49% |
| his | 3.61 | 0.49% |
| from | 3.47 | 0.47% |
| at | 3.41 | 0.46% |
| which | 3.14 | 0.42% |
| but | 2.79 | 0.38% |
| have | 2.78 | 0.37% |
| an | 2.73 | 0.37% |
| had | 2.62 | 0.35% |
| they | 2.46 | 0.33% |
| you | 2.34 | 0.31% |
| were | 2.27 | 0.31% |
| their | 2.15 | 0.29% |
| one | 2.15 | 0.29% |
| all | 2.06 | 0.28% |
| we | 2.06 | 0.28% |
| can | 1.67 | 0.22% |
| her | 1.63 | 0.22% |
| has | 1.63 | 0.22% |
| there | 1.62 | 0.22% |
| been | 1.62 | 0.22% |
| if | 1.56 | 0.21% |
| more | 1.55 | 0.21% |
| when | 1.52 | 0.20% |
| will | 1.49 | 0.20% |
| would | 1.47 | 0.20% |
| who | 1.46 | 0.20% |
| so | 1.45 | 0.19% |
| no | 1.40 | 0.19% |

## Word Lengths

And here is the breakdown of mentions (in millions) by word length. The average is 4.79 letters per word, and 80% are between 2 and 7 letters long:

| Length | Count (M) | Percent |
|--------|-----------|---------|
| 1 | 22,301.22 | 2.998% |
| 2 | 131,293.85 | 17.651% |
| 3 | 152,568.38 | 20.511% |
| 4 | 109,988.33 | 14.787% |
| 5 | 79,589.32 | 10.700% |
| 6 | 62,391.21 | 8.388% |
| 7 | 59,052.66 | 7.939% |
| 8 | 44,207.29 | 5.943% |
| 9 | 33,006.93 | 4.437% |
| 10 | 22,883.84 | 3.076% |
| 11 | 13,098.06 | 1.761% |
| 12 | 7,124.15 | 0.958% |
| 13 | 3,850.58 | 0.518% |
| 14 | 1,653.08 | 0.222% |
| 15 | 565.24 | 0.076% |
| 16 | 151.22 | 0.020% |
| 17 | 72.81 | 0.010% |
| 18 | 28.62 | 0.004% |
| 19 | 8.51 | 0.001% |

## Letter Frequencies

3,563,505,777,820 letters mentioned. Here they are in frequency order:

| Letter | Count (B) | Percent |
|--------|-----------|---------|
| E | 445.2 | 12.49% |
| T | 330.5 | 9.28% |
| A | 286.5 | 8.04% |
| O | 272.3 | 7.64% |
| I | 269.7 | 7.57% |
| N | 257.8 | 7.23% |
| S | 232.1 | 6.51% |
| R | 223.8 | 6.28% |
| H | 180.1 | 5.05% |
| L | 145.0 | 4.07% |
| D | 136.0 | 3.82% |
| C | 119.2 | 3.34% |
| U | 97.3 | 2.73% |
| M | 89.5 | 2.51% |
| F | 85.6 | 2.40% |
| P | 76.1 | 2.14% |
| G | 66.6 | 1.87% |
| W | 59.7 | 1.68% |
| Y | 59.3 | 1.66% |
| B | 52.9 | 1.48% |
| V | 37.5 | 1.05% |
| K | 19.3 | 0.54% |
| X | 8.4 | 0.23% |
| J | 5.7 | 0.16% |
| Q | 4.3 | 0.12% |
| Z | 3.2 | 0.09% |

Note there is a standard order of frequency used by typesetters, ETAOIN SHRDLU, that is slightly violated here: L, R, and C have all moved up one rank, giving us the less mnemonic ETAOIN SRHLDCU.

## Bigrams

All 26 × 26 = 676 bigrams are represented in the data. There are only seven bigrams that do not occur among the 2.8 trillion mentions: JQ, QG, QK, QY, QZ, WQ, and WZ.

### Most Common Bigrams

| Bigram | Percent | Count (B) |
|--------|---------|-----------|
| TH | 3.556% | 100.27 |
| HE | 3.075% | 86.70 |
| IN | 2.433% | 68.60 |
| ER | 2.048% | 57.75 |
| AN | 1.985% | 55.97 |
| RE | 1.854% | 52.29 |
| ED | 1.168% | 32.94 |
| ND | 1.352% | 38.13 |
| ON | 1.758% | 49.57 |
| EN | 1.454% | 41.00 |
| AT | 1.487% | 41.92 |
| ES | 1.339% | 37.77 |
| OR | 1.277% | 35.99 |
| TE | 1.205% | 33.97 |
| OF | 1.175% | 33.13 |
| IT | 1.123% | 31.67 |
| IS | 1.128% | 31.82 |
| NT | 1.041% | 29.36 |
| ST | 1.053% | 29.70 |
| TO | 1.041% | 29.36 |

## N-grams

The most common n-letter sequences (called "n-grams") for various values of n from 1 to 9:

### Most Common N-grams by Length

| 1-grams | 2-grams | 3-grams | 4-grams | 5-grams | 6-grams | 7-grams | 8-grams | 9-grams |
|---------|---------|---------|---------|---------|---------|---------|---------|---------|
| e | th | the | tion | ation | ations | present | differen | different |
| t | he | and | atio | tions | ration | ational | national | governmen |
| a | in | ing | that | which | tional | through | consider | overnment |
| o | er | ion | ther | ction | nation | between | position | formation |
| i | an | tio | with | other | ection | ication | ifferent | character |
| n | re | ent | ment | their | cation | differe | governme | velopment |
| s | on | ati | ions | there | lation | ifferen | vernment | developme |
| r | at | for | this | ition | though | general | overnmen | evelopmen |
| h | en | her | here | ement | presen | because | interest | condition |
| l | nd | ter | from | inter | tation | develop | importan | important |
| d | ti | hat | ould | ional | should | america | ormation | articular |
| c | es | tha | ting | ratio | resent | however | formatio | particula |
| u | or | ere | hich | would | genera | eration | relation | represent |

## N-gram Counts by Word Length and Position

The analysis extends Mayzner's original work by breaking out results by:
- N-gram length (1-9 characters)
- Position within word 
- Word length

### Data Files Available

| N | Types | Mentions | Description | File Size |
|---|-------|----------|-------------|-----------|
| 1 | 26 | 3,563,505,777,820 | Single letters | 20 KB |
| 2 | 669 | 2,819,662,855,499 | Bigrams | 280 KB |
| 3 | 8,653 | 2,098,121,156,991 | Trigrams | 2 MB |
| 4 | 42,171 | 1,507,873,312,542 | 4-grams | 6 MB |
| 5 | 93,713 | 1,070,193,846,800 | 5-grams | 10 MB |
| 6 | 114,565 | 742,502,715,592 | 6-grams | 10 MB |
| 7 | 104,610 | 494,400,907,903 | 7-grams | 8 MB |
| 8 | 82,347 | 308,690,305,624 | 8-grams | 5 MB |
| 9 | 59,030 | 182,032,364,549 | 9-grams | 3 MB |
| **Total** | **505,784** | **12,786,983,243,320** | **All n-grams** | **11 MB** |

### Column Notation

Each column is given a name of the form "**wordlength** / **start** : **end**". For example:
- "4/2:3" means the column counts n-grams that occur in 4-letter words, in positions 2 through 3
- "*/2:3" refers to positions 2-3 within words of any length
- "4/*" refers to any start positions in words of length 4
- "*/*" means any start position within words of any length
- "*/-3:-2" means the third-to-last through second-to-last position in words of any length

## Key Insights

1. **Scale**: This analysis used 743 billion words (37 million times more data than Mayzner's original 20,000-word sample)

2. **Letter Frequency**: The traditional typesetter's frequency "ETAOIN SHRDLU" is slightly modified to "ETAOIN SRHLDCU" based on this larger dataset

3. **Most Common Elements**:
   - Letter: E (12.49%)
   - Bigram: TH (3.56%)
   - Trigram: THE
   - Word: "the" (7.14% of all word mentions)

4. **Word Length Distribution**: Most words (20.5%) are 3 letters long, with the average being 4.79 letters

5. **Rare Combinations**: Only 7 bigrams never occur: JQ, QG, QK, QY, QZ, WQ, and WZ

This represents the most comprehensive analysis of English letter and word frequencies based on a massive corpus of digitized books, extending Mayzner's pioneering 1960s work with modern computational power and vastly more data.