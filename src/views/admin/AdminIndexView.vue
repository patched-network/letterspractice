<template>
    <div class="admin-index">
        <h1>🛠 Admin</h1>
        <p class="subtitle">
            Live tools for inspecting production. Admin-only (requires
            <code>admin</code> login).
        </p>

        <component :is="w" v-for="(w, i) in widgets" :key="i" />

        <form class="learner-open" @submit.prevent="openLearner">
            <label for="learner-username">Open learner</label>
            <input
                id="learner-username"
                v-model.trim="learnerUsername"
                placeholder="username"
                autocomplete="off"
                spellcheck="false"
            />
            <button type="submit" :disabled="!learnerUsername">Progress →</button>
        </form>

        <section v-if="buildInfo || buildInfoError" class="build-info">
            <h2>Build</h2>
            <div v-if="buildInfo" class="build-grid">
                <div><span class="k">Commit</span>
                    <a
                        v-if="buildInfo.repository && buildInfo.commit"
                        :href="`https://github.com/${buildInfo.repository}/commit/${buildInfo.commit}`"
                        target="_blank"
                        rel="noopener"
                        class="mono"
                    >{{ buildInfo.commit.slice(0, 12) }}</a>
                    <code v-else class="mono">{{ buildInfo.commit?.slice(0, 12) }}</code>
                </div>
                <div><span class="k">Built</span> <span>{{ formatBuiltAt(buildInfo.builtAt) }}</span></div>
                <div><span class="k">Actor</span> <span>{{ buildInfo.actor }}</span></div>
                <div><span class="k">Event</span> <span>{{ buildInfo.event }}</span></div>
                <div v-if="buildInfo.runId && (buildInfo.runRepository ?? buildInfo.repository)">
                    <span class="k">Run</span>
                    <a
                        :href="`https://github.com/${buildInfo.runRepository ?? buildInfo.repository}/actions/runs/${buildInfo.runId}`"
                        target="_blank"
                        rel="noopener"
                    >#{{ buildInfo.runNumber ?? buildInfo.runId }}</a>
                </div>
                <div v-if="buildInfo.reason" class="reason">
                    <span class="k">Reason</span> <span>{{ buildInfo.reason }}</span>
                </div>
            </div>
            <p v-else class="build-error">No build info available ({{ buildInfoError }}).</p>
        </section>

        <ul class="admin-list">
            <li v-for="r in routes" :key="r.path">
                <router-link :to="r.path">
                    <span class="icon">{{ r.icon }}</span>
                    <span class="label">{{ r.label }}</span>
                    <span class="path">{{ r.path }}</span>
                </router-link>
                <p v-if="r.desc" class="desc">{{ r.desc }}</p>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { deployment } from "../../deployment";
import { ADMIN_PANELS } from "./adminPanels";

interface BuildInfo {
    commit?: string;
    builtAt?: string;
    actor?: string;
    event?: string;
    reason?: string;
    ref?: string;
    runId?: string;
    runNumber?: number;
    /** Repo the built commit belongs to. */
    repository?: string;
    /** Repo whose Actions run did the deploy, when it isn't `repository`. */
    runRepository?: string;
}

// A learner's diagnostics (/admin/users/:username/*), by username: the way
// in that doesn't depend on a deployment's account list.
const router = useRouter();
const learnerUsername = ref("");
function openLearner(): void {
    if (!learnerUsername.value) return;
    void router.push({ name: "AdminUserProgress", params: { username: learnerUsername.value } });
}

const buildInfo = ref<BuildInfo | null>(null);
const buildInfoError = ref<string | null>(null);

function formatBuiltAt(iso?: string): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

onMounted(async () => {
    try {
        const res = await fetch("/buildinfo.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buildInfo.value = await res.json();
    } catch (err) {
        buildInfoError.value = err instanceof Error ? err.message : String(err);
    }
});

const routes = ADMIN_PANELS;
// The deployment's own (src/deployment/), e.g. alarms.
const widgets = deployment.adminWidgets ?? [];
</script>

<style scoped>
.learner-open {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0 16px;
}
.learner-open label {
    font-weight: 600;
}
.learner-open input {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: monospace;
}
.learner-open button {
    padding: 4px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f5f5f5;
    cursor: pointer;
}
.learner-open button:disabled {
    opacity: 0.5;
    cursor: default;
}

.admin-index {
    padding: 16px 20px;
    max-width: 900px;
    margin: 0 auto;
    font-family: "Segoe UI", system-ui, sans-serif;
    color: #2c3e50;
}

h1 {
    margin: 0 0 4px;
    font-size: 1.5em;
}

.subtitle {
    margin: 0 0 18px;
    color: #607080;
    font-size: 0.9em;
}

.subtitle code {
    background: #eef;
    border: 1px solid #ccd;
    border-radius: 3px;
    padding: 0 4px;
    font-family: monospace;
    font-size: 0.9em;
}

.admin-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.admin-list li {
    margin-bottom: 12px;
    padding: 10px 12px;
    background: #fafbfc;
    border: 1px solid #e1e6eb;
    border-left: 3px solid #3498db;
    border-radius: 4px;
    transition: background-color 0.15s ease;
}

.admin-list li:hover {
    background: #f0f8ff;
}

.admin-list a {
    display: flex;
    align-items: baseline;
    gap: 8px;
    text-decoration: none;
    color: #2c3e50;
    font-weight: 600;
    font-size: 1em;
}

.admin-list a:hover {
    color: #2980b9;
}

.icon {
    font-size: 1.1em;
}

.label {
    flex: 0 0 auto;
}

.path {
    font-family: monospace;
    font-size: 0.8em;
    color: #95a5a6;
    margin-left: auto;
}

.desc {
    margin: 4px 0 0 28px;
    font-size: 0.85em;
    color: #607080;
}

.build-info {
    margin: 0 0 22px;
    padding: 10px 14px;
    background: #f6f8fa;
    border: 1px solid #e1e6eb;
    border-radius: 4px;
}

.build-info h2 {
    margin: 0 0 8px;
    font-size: 1em;
    color: #34495e;
}

.build-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 6px 18px;
    font-size: 0.85em;
}

.build-grid .k {
    display: inline-block;
    min-width: 60px;
    color: #607080;
    font-weight: 600;
    margin-right: 6px;
}

.build-grid .reason {
    grid-column: 1 / -1;
}

.build-grid .mono,
.build-grid code {
    font-family: monospace;
    font-size: 0.95em;
}

.build-grid a {
    color: #2980b9;
    text-decoration: none;
}

.build-grid a:hover {
    text-decoration: underline;
}

.build-error {
    margin: 0;
    color: #95a5a6;
    font-size: 0.85em;
    font-style: italic;
}
</style>
