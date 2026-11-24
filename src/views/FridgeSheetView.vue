<!--
  FridgeSheetView — /fridge-sheet (alias /fridge, the short form printed on
  the sheet). Public home of the printable letter-sound tracker
  (public/print/; policy in services/fridgeSheet.ts).

  The sheet itself carries only the at-a-glance rules; the fuller learner &
  adult guidance lives here, so the paper can stay sparse. Linked from the
  landing scrollytell's off-screen beat. The in-app surfaces (session-end
  nudge, /progress) still link the PDF directly.

  The picture is FridgeSheetMini — a drawing of the sheet part-way through
  use, not a render of the PDF.
-->
<template>
  <div class="fridge-page">
    <v-container class="py-12" style="max-width: 860px">
      <h1 class="text-h4 font-weight-bold mb-3">The fridge sheet</h1>
      <p class="prose lede">
        Our one-page offline scaffold. As more skills are mastered, more of the sheet gets colored.
      </p>
      <p class="prose lede">
        Use it for casual practice and an opportunity to show off.
      </p>

      <div class="sheet-pic">
        <FridgeSheetMini :coloured="9" />
      </div>

      <div class="print-actions">
        <v-btn
          :href="pdfUrl"
          target="_blank"
          rel="noopener"
          color="primary"
          size="large"
          prepend-icon="mdi-printer-outline"
          @click="opened"
        >
          Print the sheet
        </v-btn>
        <v-btn
          :href="plainPdfUrl"
          target="_blank"
          rel="noopener"
          variant="text"
          @click="opened"
        >
          Plain version (no faces)
        </v-btn>
      </div>
      <p class="print-note">
        US Letter, landscape. Print at 100% with margins set to none. On A4,
        choose fit-to-page.
      </p>

      <section class="guide">
        <h2 class="text-h5 font-weight-bold mb-2">For the learner and their adult</h2>
        <ul class="prose-list">
          <li>
            When the app introduces a new letter, colour in its key. Keep the
            colour light enough that the letter still shows through.
          </li>
          <li>
            When the app introduces a letter team (<b>sh</b>, <b>ch</b>,
            <b>a_e</b>…), colour its box in the lower right.
          </li>
          <li>
            The end-of-session screen will say when there's something new to
            colour in.
          </li>
          <li>
            Connect sounds together and spell things out, often. Focus on the
            sounds, and don't worry when a spelling isn't by-the-book correct:
            <i>kat</i> for <i>cat</i> is a good spelling of the sounds.
          </li>
        </ul>
      </section>

      <p v-if="contactEmail" class="prose contact">
        Questions? Comments? Let us know how it's going:
        <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
      </p>
    </v-container>

    <LandingFooter />
  </div>
</template>

<script setup lang="ts">
import FridgeSheetMini from "../components/landing/FridgeSheetMini.vue";
import LandingFooter from "../components/landing/LandingFooter.vue";
import {
  FRIDGE_SHEET_PDF_URL as pdfUrl,
  FRIDGE_SHEET_PLAIN_PDF_URL as plainPdfUrl,
} from "../services/fridgeSheet";
import { markFridgeSheetOpened } from "../services/userState";
import { pitch } from "../deployment";

/** Whoever runs this deployment (its pitch); none in the open build. */
const contactEmail = pitch?.contactEmail ?? "";

// Opening = printed (services/fridgeSheet.ts), so the session-end nudge
// switches from "print the sheet" to "colour these in".
function opened() {
  void markFridgeSheetOpened();
}
</script>

<style scoped>
.prose {
  line-height: 1.7;
  margin-bottom: 12px;
}
.lede {
  font-size: 1.1rem;
}
.prose-list {
  padding-left: 1.25rem;
  line-height: 1.7;
}
.prose-list .prose-list {
  margin-top: 2px;
}

.sheet-pic {
  max-width: 560px;
  margin: 24px auto 20px;
  transform: rotate(-1.5deg);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.08),
    0 16px 36px rgba(0, 0, 0, 0.16);
}
.sheet-pic :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.print-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px 16px;
}
.print-note {
  margin: 8px 0 0;
  text-align: center;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.guide {
  margin-top: 40px;
}
.contact {
  margin-top: 40px;
}
</style>
