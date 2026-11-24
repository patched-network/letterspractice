/**
 * The single entitlement/course key for this site's per-user course state.
 *
 * MUST match what actually writes + reads entitlements and session tracking:
 * signup (SignUpView), `services/dripGate.ts` (the entitlement wall), the
 * deployment's entitlement provider and its server side (`src/deployment/`),
 * and the sessionTracker store's UserDB record (`config.sessionTracking[<key>]`).
 * The value is stored in existing user DBs: don't change it.
 *
 * History of drift around this key has produced real bugs twice:
 *   - admin view once read 'letterspractice' → every user bucketed as
 *     no-entitlement;
 *   - sessionTracker once wrote under 'default' while the (since-retired)
 *     trial guard read 'letterspractice-basic' → trial session counts always
 *     0, so trials never expired.
 * Import this constant instead of writing the literal.
 */
export const ENTITLEMENT_COURSE_ID = 'letterspractice-basic';
