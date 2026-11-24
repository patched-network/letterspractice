import { defineStore } from "pinia";
import { ref, computed, readonly } from "vue";
import { getUserProfile, putUserProfile } from "../services/userState";
import type { UserProfileData } from "../services/userState.types";

export interface OnboardingData {
  // Required - Screen Zero
  childAge: string; // "2-2.5 years" | "2.5-3 years" etc.
  literacyLevel: 1 | 2 | 3 | 4; // maps to spec options

  // Optional - Screen One
  contentPreferences: Record<
    string,
    "not-interested" | "neutral" | "interested"
  >;

  // Optional - Screen Two
  names: {
    family: string[];
    pets: string[];
    friends: string[];
    toys: string[];
  };

  // Optional - Screen Three
  sensitiveWords: string[];

  // Optional - Screen Four
  seasonalSettings: {
    enabled: boolean;
    excludedHolidays: string[];
  };

  // Holiday requests
  holidayRequests: string[];

  // Flow control
  completedScreens: string[];
  completed: boolean;
  startedAt: string;
  completedAt?: string;
}

// Onboarding flow configuration
export interface OnboardingScreenConfig {
  key: string;
  route: string;
  title: string;
  required: boolean;
  enabled: boolean;
  order: number;
}

export const ONBOARDING_FLOW_CONFIG: Record<string, OnboardingScreenConfig> = {
  age: {
    key: "age",
    route: "/onboarding/age",
    title: "Tell us about your child",
    required: true,
    enabled: true,
    order: 1,
  },
  literacy: {
    key: "literacy",
    route: "/onboarding/literacy",
    title: "Literacy level",
    required: true,
    enabled: false,
    order: 2,
  },
  preferences: {
    key: "preferences",
    route: "/onboarding/preferences",
    title: "What interests your child?",
    required: false,
    enabled: false,
    order: 3,
  },
  // names: {
  //   key: 'names',
  //   route: '/onboarding/names',
  //   title: 'Tell us about your child\'s world',
  //   required: false,
  //   enabled: true,
  //   order: 3
  // },
  sensitive: {
    key: "sensitive",
    route: "/onboarding/sensitive",
    title: "Words to avoid (optional)",
    required: false,
    enabled: false,
    order: 4,
  },
  decorations: {
    key: "decorations",
    route: "/onboarding/decorations",
    title: "Seasonal themes & decorations",
    required: false,
    enabled: false,
    order: 5,
  },
};

// Get enabled screens in order
export const getEnabledScreens = (): OnboardingScreenConfig[] => {
  return Object.values(ONBOARDING_FLOW_CONFIG)
    .filter((screen) => screen.enabled)
    .sort((a, b) => a.order - b.order);
};

// Legacy array for backwards compatibility
export const ONBOARDING_SCREENS = getEnabledScreens().map(
  (screen) => screen.key,
) as readonly string[];

export type OnboardingScreen = string;

const STORAGE_KEY = "letterspractice-onboarding";

function getInitialData(): OnboardingData {
  return {
    childAge: "",
    literacyLevel: 1,
    contentPreferences: {},
    names: {
      family: [],
      pets: [],
      friends: [],
      toys: [],
    },
    sensitiveWords: [],
    seasonalSettings: {
      enabled: true,
      excludedHolidays: [],
    },
    holidayRequests: [],
    completedScreens: [],
    completed: false,
    startedAt: new Date().toISOString(),
  };
}

function loadFromStorage(): OnboardingData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate structure and merge with defaults
      return {
        ...getInitialData(),
        ...parsed,
      };
    }
  } catch (error) {
    console.warn("Failed to load onboarding data from localStorage:", error);
  }
  return getInitialData();
}

/**
 * Attempt to load profile data from UserDB (strategy state).
 * Covers the "cleared browser / new device" case for logged-in users.
 *
 * Returns merged OnboardingData if a UserProfile exists in UserDB,
 * or null if nothing was found.
 */
async function loadFromUserDB(): Promise<OnboardingData | null> {
  try {
    const profile = await getUserProfile();
    if (profile && profile.childAge) {
      // Merge UserDB profile into default onboarding structure
      return {
        ...getInitialData(),
        childAge: profile.childAge,
        literacyLevel: profile.literacyLevel,
        contentPreferences: profile.contentPreferences ?? {},
        sensitiveWords: profile.sensitiveWords ?? [],
        seasonalSettings: profile.seasonalSettings ?? {
          enabled: true,
          excludedHolidays: [],
        },
        completed: true,
        completedAt: profile.completedAt,
      };
    }
  } catch (error) {
    console.warn("Failed to load onboarding data from UserDB:", error);
  }
  return null;
}

function saveToStorage(data: OnboardingData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Failed to save onboarding data to localStorage:", error);
  }
}

export const useOnboardingStore = defineStore("onboarding", () => {
  // State — initialize from localStorage synchronously, then backfill from UserDB
  const data = ref<OnboardingData>(loadFromStorage());

  // If localStorage had no completed onboarding, try UserDB (async backfill)
  if (!data.value.completed) {
    loadFromUserDB().then((fromDB) => {
      if (fromDB && fromDB.completed) {
        data.value = fromDB;
        saveToStorage(fromDB);
      }
    });
  }

  // Getters
  const isScreenCompleted = computed(() => (screen: OnboardingScreen) => {
    return data.value.completedScreens.includes(screen);
  });

  const isBasicsCompleted = computed(() => {
    return data.value.childAge !== "" && data.value.literacyLevel > 0;
  });

  const canSkipScreen = computed(() => (screen: OnboardingScreen) => {
    const screenConfig = ONBOARDING_FLOW_CONFIG[screen];
    return screenConfig ? !screenConfig.required : true;
  });

  const nextScreen = computed(() => (currentScreen: OnboardingScreen) => {
    const enabledScreens = getEnabledScreens();
    const currentIndex = enabledScreens.findIndex(
      (s) => s.key === currentScreen,
    );
    if (currentIndex >= 0 && currentIndex < enabledScreens.length - 1) {
      return enabledScreens[currentIndex + 1].key;
    }
    return null;
  });

  const previousScreen = computed(() => (currentScreen: OnboardingScreen) => {
    const enabledScreens = getEnabledScreens();
    const currentIndex = enabledScreens.findIndex(
      (s) => s.key === currentScreen,
    );
    if (currentIndex > 0) {
      return enabledScreens[currentIndex - 1].key;
    }
    return null;
  });

  const progressPercentage = computed(() => {
    const enabledScreens = getEnabledScreens();
    const enabledScreenKeys = enabledScreens.map(s => s.key);

    // Only count completed screens that are currently enabled
    const completedEnabledScreens = data.value.completedScreens.filter(screen =>
      enabledScreenKeys.includes(screen)
    );

    return Math.round(
      (completedEnabledScreens.length / enabledScreens.length) * 100,
    );
  });

  // Actions
  function updateChildAge(age: string) {
    data.value.childAge = age;
    saveToStorage(data.value);
  }

  function updateLiteracyLevel(level: 1 | 2 | 3 | 4) {
    data.value.literacyLevel = level;
    saveToStorage(data.value);
  }

  function updateContentPreference(
    category: string,
    preference: "not-interested" | "neutral" | "interested",
  ) {
    data.value.contentPreferences[category] = preference;
    saveToStorage(data.value);
  }

  function updateNames(
    category: keyof OnboardingData["names"],
    names: string[],
  ) {
    data.value.names[category] = names;
    saveToStorage(data.value);
  }

  function updateSensitiveWords(words: string[]) {
    data.value.sensitiveWords = words;
    saveToStorage(data.value);
  }

  function updateSeasonalSettings(
    enabled: boolean,
    excludedHolidays: string[] = [],
  ) {
    data.value.seasonalSettings = { enabled, excludedHolidays };
    saveToStorage(data.value);
  }

  function addHolidayRequest(holiday: string) {
    if (holiday.trim() && !data.value.holidayRequests.includes(holiday.trim())) {
      data.value.holidayRequests.push(holiday.trim());
      saveToStorage(data.value);
    }
  }

  function markScreenCompleted(screen: OnboardingScreen) {
    if (!data.value.completedScreens.includes(screen)) {
      data.value.completedScreens.push(screen);
      saveToStorage(data.value);
    }
  }

  function markScreenIncomplete(screen: OnboardingScreen) {
    const index = data.value.completedScreens.indexOf(screen);
    if (index > -1) {
      data.value.completedScreens.splice(index, 1);
      saveToStorage(data.value);
    }
  }

  async function completeOnboarding() {
    data.value.completed = true;
    data.value.completedAt = new Date().toISOString();
    saveToStorage(data.value);

    // Persist to UserDB (syncs to CouchDB, survives browser clear)
    try {
      const profile: UserProfileData = {
        childAge: data.value.childAge,
        literacyLevel: data.value.literacyLevel,
        contentPreferences: data.value.contentPreferences,
        sensitiveWords: data.value.sensitiveWords,
        seasonalSettings: data.value.seasonalSettings,
        completedAt: data.value.completedAt,
      };
      await putUserProfile(profile);
    } catch (e) {
      console.warn("Failed to persist onboarding to UserDB:", e);
      // Non-fatal: localStorage still has the data
    }
  }

  function resetOnboarding() {
    data.value = getInitialData();
    saveToStorage(data.value);
  }

  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to clear onboarding storage:", error);
    }
  }

  return {
    // State
    data: readonly(data),

    // Getters
    isScreenCompleted,
    isBasicsCompleted,
    canSkipScreen,
    nextScreen,
    previousScreen,
    progressPercentage,

    // Actions
    updateChildAge,
    updateLiteracyLevel,
    updateContentPreference,
    updateNames,
    updateSensitiveWords,
    updateSeasonalSettings,
    addHolidayRequest,
    markScreenCompleted,
    markScreenIncomplete,
    completeOnboarding,
    resetOnboarding,
    clearStorage,

    // Flow configuration helpers
    getEnabledScreens: () => getEnabledScreens(),
    getScreenConfig: (screen: OnboardingScreen) =>
      ONBOARDING_FLOW_CONFIG[screen],
    isValidScreen: (screen: string) =>
      screen in ONBOARDING_FLOW_CONFIG &&
      ONBOARDING_FLOW_CONFIG[screen].enabled,
  };
});
