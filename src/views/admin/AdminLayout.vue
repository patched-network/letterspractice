<template>
    <div class="admin-layout">
        <!-- Status line: mount admin-wide warnings/notices here -->
        <!-- <AdminStatusLine v-if="statusMessage" :message="statusMessage" /> -->

        <!-- Every page but the index (which lists the panels itself): the
             panels, and on a learner's pages that learner's views. -->
        <nav v-if="route.name !== 'AdminIndex'" class="admin-nav">
            <div class="admin-nav__row">
                <router-link to="/admin" class="admin-nav__home">← Admin</router-link>
                <router-link
                    v-for="p in ADMIN_PANELS"
                    :key="p.path"
                    :to="p.path"
                    class="admin-nav__link"
                    :class="{ 'is-active': route.path === p.path || route.path.startsWith(p.path + '/') }"
                >
                    <span class="admin-nav__icon">{{ p.icon }}</span>{{ p.label }}
                </router-link>
            </div>
            <div v-if="username" class="admin-nav__row admin-nav__row--learner">
                <span class="admin-nav__who">👤 {{ username }}</span>
                <router-link
                    v-for="v in LEARNER_VIEWS"
                    :key="v.name"
                    :to="{ name: v.name, params: { username } }"
                    class="admin-nav__link"
                    :class="{ 'is-active': isCurrent(v) }"
                >
                    {{ v.label }}
                </router-link>
            </div>
        </nav>

        <router-view />
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { ADMIN_PANELS, LEARNER_VIEWS, type LearnerView } from "./adminPanels";

const route = useRoute();

/** The learner whose pages these are (`/admin/users/:username/*`). */
const username = computed(() => {
    const u = route.params.username;
    return typeof u === "string" && u ? u : null;
});

function isCurrent(v: LearnerView): boolean {
    const name = String(route.name ?? "");
    return name === v.name || (v.also ?? []).includes(name);
}
</script>

<style scoped>
.admin-layout {
    display: flex;
    flex-direction: column;
    min-height: 100%;
}

.admin-nav {
    padding: 6px 20px;
    background: #f6f8fa;
    border-bottom: 1px solid #e1e6eb;
    font-size: 0.85em;
}

.admin-nav__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
}

.admin-nav__row--learner {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid #e1e6eb;
}

.admin-nav__home {
    margin-right: 8px;
    color: #2980b9;
    text-decoration: none;
    font-weight: 600;
}

.admin-nav__who {
    margin-right: 8px;
    font-weight: 600;
    color: #2c3e50;
}

.admin-nav__link {
    padding: 2px 8px;
    border-radius: 4px;
    color: #2980b9;
    text-decoration: none;
    white-space: nowrap;
}

.admin-nav__icon {
    margin-right: 4px;
}

.admin-nav__home:hover,
.admin-nav__link:hover {
    text-decoration: underline;
}

.admin-nav__link.is-active {
    background: #dde8f3;
    color: #1d4f7a;
    font-weight: 600;
}
</style>
