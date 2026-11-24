<template>
  <OnboardingLayout
    current-screen="names"
    screen-title="Tell us about your child's world"
    :can-continue="true"
  >
    <div class="onboarding-names">
      <div class="mb-6">
        <h2 class="text-h5 mb-2 text-primary">Important People & Friends</h2>
        <p class="text-body-1 text-medium-emphasis mb-6">
          Names of loved ones are great motivators and learning tools. Add the names that matter most to your child.
        </p>
        <div class="text-caption text-medium-emphasis mb-4">
          <v-icon icon="mdi-lightbulb-outline" size="small" class="mr-1" />
          Phonetically simple names work best, but all names are welcome!
        </div>
      </div>

      <v-row>
        <v-col cols="12" md="6" v-for="category in nameCategories" :key="category.key">
          <v-card elevation="1" class="name-category-card">
            <v-card-title class="pb-2">
              <v-icon :icon="category.icon" class="mr-2" color="primary" />
              {{ category.label }}
            </v-card-title>
            <v-card-text>
              <div class="name-input-section">
                <!-- Existing names as chips -->
                <div v-if="names[category.key].length > 0" class="mb-3">
                  <v-chip
                    v-for="(name, index) in names[category.key]"
                    :key="`${category.key}-${index}`"
                    closable
                    @click:close="removeName(category.key, index)"
                    class="mr-2 mb-2"
                    color="primary"
                    variant="outlined"
                  >
                    {{ name }}
                  </v-chip>
                </div>

                <!-- Input for new name -->
                <v-text-field
                  v-model="newNameInputs[category.key]"
                  :placeholder="category.placeholder"
                  variant="outlined"
                  density="compact"
                  @keyup.enter="addName(category.key)"
                  hide-details
                >
                  <template #append-inner>
                    <v-btn
                      icon="mdi-plus"
                      size="small"
                      variant="text"
                      @click="addName(category.key)"
                      :disabled="!newNameInputs[category.key]?.trim()"
                    />
                  </template>
                </v-text-field>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <div class="mt-6">
        <v-alert
          type="info"
          variant="tonal"
          class="text-body-2"
        >
          <template #prepend>
            <v-icon icon="mdi-information-outline" />
          </template>
          These names will appear in personalized learning activities to help keep your child engaged. You can always add or remove names later in settings.
        </v-alert>
      </div>
    </div>
  </OnboardingLayout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useOnboardingStore, type OnboardingData } from '@/stores/onboarding'
import OnboardingLayout from '@/components/onboarding/OnboardingLayout.vue'

const onboardingStore = useOnboardingStore()

// Local reactive state
const names = reactive<OnboardingData['names']>({
  family: [],
  pets: [],
  friends: [],
  toys: []
})

const newNameInputs = ref<Record<string, string>>({
  family: '',
  pets: '',
  friends: '',
  toys: ''
})

// Name categories from spec
const nameCategories = [
  {
    key: 'family' as keyof OnboardingData['names'],
    label: 'Family Members',
    icon: 'mdi-account-group',
    placeholder: 'Mom, Dad, Emma, Sam...'
  },
  {
    key: 'pets' as keyof OnboardingData['names'],
    label: 'Pets',
    icon: 'mdi-paw',
    placeholder: 'Spot, Luna, Max...'
  },
  {
    key: 'friends' as keyof OnboardingData['names'],
    label: 'Close Friends',
    icon: 'mdi-account-heart',
    placeholder: 'Alex, Maya...'
  },
  {
    key: 'toys' as keyof OnboardingData['names'],
    label: 'Favorite Toys',
    icon: 'mdi-teddy-bear',
    placeholder: 'Teddy, Dolly...'
  }
]

// Methods
const addName = (category: keyof OnboardingData['names']) => {
  const newName = newNameInputs.value[category]?.trim()
  if (newName && !names[category].includes(newName)) {
    names[category].push(newName)
    onboardingStore.updateNames(category, [...names[category]])
    newNameInputs.value[category] = ''
  }
}

const removeName = (category: keyof OnboardingData['names'], index: number) => {
  names[category].splice(index, 1)
  onboardingStore.updateNames(category, [...names[category]])
}

// Initialize from store on mount
onMounted(() => {
  const storeNames = onboardingStore.data.names

  // Copy existing names from store
  Object.keys(names).forEach(key => {
    const categoryKey = key as keyof OnboardingData['names']
    names[categoryKey] = [...(storeNames[categoryKey] || [])]
  })
})
</script>

<style scoped>
.onboarding-names {
  max-width: 900px;
  margin: 0 auto;
}

.name-category-card {
  height: 100%;
}

.name-input-section {
  min-height: 80px;
}

.v-chip {
  max-width: 140px;
}

.v-chip :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .text-h5 {
    font-size: 1.25rem !important;
  }

  .v-chip {
    max-width: 120px;
  }
}
</style>