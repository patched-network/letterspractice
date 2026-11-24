# Admin views

Internal tooling at `/admin/*` (routes in `src/router/index.ts`, shell in
`AdminLayout.vue`). Not learner-facing, so the design-system rules for toddler
UX don't apply; dense Vuetify tables and cards are fine.

## Click-to-copy

Admin data often ends up pasted into notes, an issue, a test case, or an LLM
conversation. **When you build or substantially extend an admin view, give it
click-to-copy where it's useful**, using `useClickToCopy()` from
`./useClickToCopy.ts`:

- **Whole view:** a header button (`Copy for LLM`) that copies a plain-text
  rendering of everything the view is showing, including the scope it was
  loaded with (user, session, date range). It should read on its own, without
  the screen.
- **Per section / per row:** a small `mdi-content-copy` icon button on cards,
  rows, or blocks that are worth lifting out on their own.
- **Identifiers:** ids that get pasted elsewhere (cardId, username, sessionId),
  and values the UI truncates (long URLs, referrers).

Copied text should match the numbers on screen. Build it from the same
helpers the template uses, not a parallel computation. Plain text or light
markdown; no HTML.

Examples: `AdminUserSessionDetailView.vue` (dump, per-run, per-card, hints),
`LearnerDbPanel.vue` in `src/components/admin/` (per-card).

Business admin views (Users, Mailing list, Insights) live in the deployment
overlay (`src/deployment/`), not here.

## Read-only pipeline runs

`AdminUserPipelineRunView.vue` (`/admin/users/:username/pipeline-run`) runs
the course pipeline for a learner without writing to their data. The
machinery is in `src/services/adminPipelineRun.ts`: a `UserDBInterface` built
from the learner dump (writes recorded, not applied; unknown methods throw)
and a course-DB wrapper that points the couch CourseDB's "current user" reads
at the learner. Reuse it for any admin feature that needs to ask "what would
the pipeline do for this learner?". Known leak: LP's drip gate reads the
logged-in admin's entitlement (the view warns when it matters).
