<template>
  <v-container class="d-flex justify-center align-center" style="min-height: 60vh;">
    <EmailSignupForm
      :heading="copy.heading"
      :description="copy.description"
      submit-text="Subscribe"
      success-text="You're on the list — thank you!"
      already-subscribed-text="You're already on the list!"
    />
  </v-container>
</template>

<script setup lang="ts">
/**
 * Standalone landing page for the mailing list, so the list has a URL that can
 * be linked to from outside the SPA — blog post footers, HN comments, etc.
 * The in-app capture point is the landing footer (LandingFooter.vue), which is
 * not addressable on its own.
 *
 * Copy is shared with the footer form deliberately: same list, same promise.
 */
import EmailSignupForm from '../components/landing/EmailSignupForm.vue';
import { landingPageCopy } from '../content/landingPageCopy';

const copy = landingPageCopy.footer.emailSignup;
</script>
