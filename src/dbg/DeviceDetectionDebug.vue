<template>
    <div class="device-detection-debug">
        <h1>🖥️ Device Detection Debug</h1>
        <p class="subtitle">
            Inspects <code>src/utils/deviceDetection.ts</code> — the
            heuristic that picks ProgressiveKeyboard's <code>showShift</code>
            default (on for laptop/desktop, off for Chrome OS, touch-only
            devices, and phones/tablets). Signals update live, so Chrome DevTools'
            device toolbar (touch emulation) and physically
            attaching/detaching a mouse/trackpad should move the numbers
            below in real time.
        </p>

        <div class="two-column-layout">
            <!-- LEFT: raw + derived signals -->
            <div class="column">
                <section class="debug-section">
                    <h2>Raw Signals</h2>
                    <table class="signal-table">
                        <tbody>
                            <tr>
                                <td><code>(pointer: coarse)</code></td>
                                <td>
                                    <BoolBadge
                                        :value="signals.primaryPointerCoarse"
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td><code>(hover: none)</code></td>
                                <td>
                                    <BoolBadge
                                        :value="signals.primaryHoverNone"
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td><code>(any-pointer: fine)</code></td>
                                <td>
                                    <BoolBadge :value="signals.anyPointerFine" />
                                </td>
                            </tr>
                            <tr>
                                <td><code>(any-hover: hover)</code></td>
                                <td>
                                    <BoolBadge :value="signals.anyHoverHover" />
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <h3>User Agent</h3>
                    <p class="ua-string">{{ userAgent }}</p>
                    <p class="ua-detail">
                        <code>navigator.userAgentData?.platform</code>:
                        {{ uaDataPlatform ?? "(unavailable)" }}
                    </p>
                    <p class="ua-detail">
                        <code>navigator.userAgentData?.mobile</code>:
                        {{ uaDataMobile ?? "(unavailable)" }}
                    </p>
                </section>

                <section class="debug-section">
                    <h2>Derived</h2>
                    <table class="signal-table">
                        <tbody>
                            <tr>
                                <td>isChromeOS()</td>
                                <td><BoolBadge :value="chromeOS" /></td>
                            </tr>
                            <tr>
                                <td>isTouchOnlyDevice()</td>
                                <td><BoolBadge :value="touchOnly" /></td>
                            </tr>
                            <tr>
                                <td>isMobileUserAgent()</td>
                                <td><BoolBadge :value="mobileUA" /></td>
                            </tr>
                            <tr class="highlight-row">
                                <td>getDefaultShowShift()</td>
                                <td><BoolBadge :value="defaultShowShift" /></td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            </div>

            <!-- RIGHT: live keyboard demo -->
            <div class="column">
                <section class="debug-section demo-section">
                    <h2>Live Demo</h2>

                    <div class="override-row">
                        <span>showShift override:</span>
                        <v-btn-toggle
                            v-model="overrideMode"
                            mandatory
                            color="primary"
                            variant="outlined"
                            density="comfortable"
                        >
                            <v-btn value="auto">Auto (default)</v-btn>
                            <v-btn value="on">Force On</v-btn>
                            <v-btn value="off">Force Off</v-btn>
                        </v-btn-toggle>
                    </div>

                    <p class="section-hint">
                        <template v-if="overrideMode === 'auto'">
                            No <code>show-shift</code> prop passed — the
                            keyboard below is using
                            <code>getDefaultShowShift()</code> internally.
                        </template>
                        <template v-else>
                            <code>show-shift</code> explicitly set to
                            <strong>{{ overrideMode === "on" }}</strong>.
                        </template>
                    </p>

                    <div class="demo-container">
                        <ProgressiveKeyboard
                            :letters="['s', 'a', 't', 'p', 'i', 'n', 'space']"
                            :show-shift="resolvedOverride"
                            :lowercase-keycaps="true"
                            :capture-keyboard="true"
                        />
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, defineComponent, h } from "vue";
import { ProgressiveKeyboard } from "../components/keyboard";
import {
    getDeviceInputSignals,
    isChromeOS,
    isTouchOnlyDevice,
    isMobileUserAgent,
    getDefaultShowShift,
} from "@/utils/deviceDetection";

// Tiny inline badge component (avoids a new file for one span)
const BoolBadge = defineComponent({
    props: { value: { type: Boolean, required: true } },
    setup(props) {
        return () =>
            h(
                "span",
                {
                    class: ["bool-badge", props.value ? "is-true" : "is-false"],
                },
                props.value ? "true" : "false",
            );
    },
});

const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
const uaData =
    typeof navigator !== "undefined"
        ? (
              navigator as Navigator & {
                  userAgentData?: { platform?: string; mobile?: boolean };
              }
          ).userAgentData
        : undefined;
const uaDataPlatform = uaData?.platform;
const uaDataMobile = uaData?.mobile;

// Bumped on any matchMedia 'change' event to force the derived computeds
// below to re-read the live signals — keeps this view honest without
// duplicating the decision logic living in deviceDetection.ts.
const signalsVersion = ref(0);
const mediaQueryLists: MediaQueryList[] = [];

const signals = computed(() => {
    void signalsVersion.value;
    return getDeviceInputSignals();
});
const touchOnly = computed(() => {
    void signalsVersion.value;
    return isTouchOnlyDevice();
});
const chromeOS = isChromeOS(); // not expected to change mid-session
const mobileUA = isMobileUserAgent(); // UA is fixed for the session
const defaultShowShift = computed(() => {
    void signalsVersion.value;
    return getDefaultShowShift();
});

const overrideMode = ref<"auto" | "on" | "off">("auto");
const resolvedOverride = computed<boolean | undefined>(() => {
    if (overrideMode.value === "on") return true;
    if (overrideMode.value === "off") return false;
    return undefined;
});

onMounted(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const queries = [
        "(pointer: coarse)",
        "(hover: none)",
        "(any-pointer: fine)",
        "(any-hover: hover)",
    ];

    for (const query of queries) {
        const mql = window.matchMedia(query);
        const onChange = () => {
            signalsVersion.value++;
        };
        mql.addEventListener("change", onChange);
        mediaQueryLists.push(mql);
        // Store the handler for cleanup via a closure-carrying array entry
        (mql as MediaQueryList & { __onChange?: () => void }).__onChange =
            onChange;
    }
});

onBeforeUnmount(() => {
    for (const mql of mediaQueryLists) {
        const handler = (mql as MediaQueryList & { __onChange?: () => void })
            .__onChange;
        if (handler) mql.removeEventListener("change", handler);
    }
});
</script>

<style scoped>
.device-detection-debug {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
    font-family: system-ui, -apple-system, sans-serif;
}

.device-detection-debug h1 {
    font-size: 2rem;
    margin-bottom: 8px;
}

.subtitle {
    color: #666;
    margin-bottom: 32px;
    max-width: 800px;
}

.two-column-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: start;
}

.column {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.debug-section {
    padding: 20px;
    background: #f5f5f5;
    border-radius: 12px;
}

.debug-section h2 {
    font-size: 1.25rem;
    margin-bottom: 16px;
    color: #333;
}

.debug-section h3 {
    font-size: 1rem;
    margin: 16px 0 8px;
    color: #555;
}

.signal-table {
    width: 100%;
    border-collapse: collapse;
}

.signal-table td {
    padding: 6px 8px;
    border-bottom: 1px solid #e0e0e0;
}

.signal-table td:first-child {
    font-family: "Monaco", "Consolas", monospace;
    font-size: 0.85rem;
}

.highlight-row td {
    font-weight: 700;
    background: #fff7e0;
}

.bool-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
}

.bool-badge.is-true {
    background: #d4edda;
    color: #1e7e34;
}

.bool-badge.is-false {
    background: #f1f1f1;
    color: #666;
}

.ua-string {
    font-family: "Monaco", "Consolas", monospace;
    font-size: 0.75rem;
    background: white;
    padding: 8px;
    border-radius: 6px;
    word-break: break-all;
}

.ua-detail {
    font-size: 0.85rem;
    color: #555;
    margin-top: 8px;
}

.demo-section {
    background: #e8f5e9;
}

.override-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.section-hint {
    color: #666;
    font-size: 0.875rem;
    margin-bottom: 12px;
}

.demo-container {
    display: flex;
    justify-content: center;
    padding: 32px;
    background: white;
    border-radius: 8px;
    min-height: 200px;
}

@media (max-width: 900px) {
    .two-column-layout {
        grid-template-columns: 1fr;
    }
}
</style>
