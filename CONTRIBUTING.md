# Contributing

Issues (bugs, questions, ideas) and small PRs that are clear wins are welcome
without prior discussion. For a large PR, open an issue first.

## Licensing of contributions

By submitting a contribution to this repository (a pull request, patch, or
other code or content), you:

1. license it under this repository's license, AGPL-3.0-or-later (`LICENSE`);
2. also grant Colin Kennedy, and Colin Kennedy's successors and assigns, a
   perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to
   use, reproduce, modify, sublicense and distribute your contribution under
   any terms, including proprietary ones; and
3. confirm that you have the right to make these grants: the work is your
   own, or you have permission to contribute it on these terms.

Why (2): the hosted LettersPractice runs this code together with closed parts
(payments, business admin), which a deployment adds at build time (see
`src/deployment/`). Without (2), outside code couldn't go into that build.
The open project stays AGPL either way.
