/**
 * The admin panels, listed once: the index page's list (AdminIndexView) and
 * the nav bar on every other admin page (AdminLayout) both read these. The
 * deployment's (src/deployment/) come after the app's own.
 */
import { deployment } from '../../deployment';

export interface AdminPanel {
  path: string;
  label: string;
  icon: string;
  desc?: string;
}

const OPEN_PANELS: AdminPanel[] = [
  {
    path: '/admin/content',
    label: 'Content Explorer',
    icon: '📚',
    desc: 'Browse cards, tags, and course content from CouchDB.',
  },
  {
    path: '/admin/register-questions',
    label: 'Register Questions',
    icon: '📝',
    desc: 'Register new question types with the courseware backend.',
  },
  {
    path: '/admin/audio-listener',
    label: 'Audio Listener',
    icon: '🎧',
    desc: 'Listen to phoneme + word audio (live, against prod assets).',
  },
];

export const ADMIN_PANELS: AdminPanel[] = [...OPEN_PANELS, ...(deployment.adminPanels ?? [])];

/** One learner's views (`/admin/users/:username/*`), by route name. */
export interface LearnerView {
  name: string;
  label: string;
  /** Other route names that count as this view (a session's detail page is under Sessions). */
  also?: string[];
}

export const LEARNER_VIEWS: LearnerView[] = [
  { name: 'AdminUserProgress', label: 'Progress' },
  { name: 'AdminUserSessions', label: 'Sessions', also: ['AdminUserSessionDetail'] },
  { name: 'AdminUserCards', label: 'Cards' },
  { name: 'AdminUserSpelling', label: 'Spelling' },
  { name: 'AdminUserElo', label: 'ELO' },
  { name: 'AdminUserPipeline', label: 'Pipeline' },
  { name: 'AdminUserPipelineRun', label: 'Pipeline run' },
];
