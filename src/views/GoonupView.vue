<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <p class="text-body-1 mb-4" style="white-space: pre-line">
          Thanks for trying this out.
        </p>

        <p class="text-body-1 mb-4" style="white-space: pre-line">
          You are early here. I will be shocked if you don't encounter any issues in terms of software bugginess, and possibly in terms of content sequencing / pedagogy.
        </p>

        <p class="text-body-1 mb-4" style="white-space: pre-line">
          Feedback on <em>whatever</em> can come via Forums DM
          (<a href="https://forums.somethingawful.com/private.php?action=newmessage&userid=92440" target="_blank">link</a>)
          or email to <a href="mailto:colin@letterspractice.com">colin@letterspractice.com</a>, or also feel free
          to trash me and the app directly in the parenting ask/tell thread.
        </p>

        <p class="text-body-1 mb-4" style="white-space: pre-line">
          If you are friendly to the idea, I have a couple of "survey style" follow up questions that I'd like to ask after you've had a little time with the app,
          but I'll wait for you to ping me at your own discretion for this.
        </p>

        <p class="text-body-1 mb-4" style="white-space: pre-line">
          I hope you like it!
        </p>
      </v-col>
    </v-row>
  </v-container>
  <!-- grant-token comps the new account into the 'goon' cohort on signup -->
  <SignUpView grant-token="goon" />
</template>

<script setup lang="ts">
import SignUpView from "./SignUpView.vue";
</script>
