import { ref, shallowRef, watch, type Ref } from 'vue';
import {
  fetchLearnerDump,
  fromDump,
  type LearnerDataset,
  type LearnerDump,
} from '@vue-skuilder/db/diagnostics';
import { getCouchBaseUrl } from '@/services/usersDb';
import config from '../../../../skuilder.config.json';

// One fetch per learner per page load: the framework views move between
// sessions, a session, and cards without refetching. `reload` bypasses it.
const cache = new Map<string, Promise<LearnerDump>>();

/** A learner's dataset for the framework admin views, read with the admin's couch cookie. */
export function useAdminLearnerDataset(username: Ref<string>) {
  const dump = shallowRef<LearnerDump | null>(null);
  const dataset = shallowRef<LearnerDataset | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(force = false): Promise<void> {
    const user = username.value;
    if (!user) return;
    loading.value = true;
    error.value = null;
    try {
      if (force || !cache.has(user)) {
        const pending = fetchLearnerDump({
          couchUrl: getCouchBaseUrl(),
          username: user,
          courseId: config.course,
          auth: { kind: 'cookie' },
        });
        cache.set(user, pending);
        pending.catch(() => cache.delete(user));
      }
      const d = await cache.get(user)!;
      if (user !== username.value) return;
      dump.value = d;
      dataset.value = fromDump(d, config.course);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  watch(username, () => void load(), { immediate: true });

  return { dump, dataset, loading, error, reload: () => load(true) };
}
