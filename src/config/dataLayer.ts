/**
 * Which data layer a build uses. Shared by the app (src/ENVIRONMENT_VARS.ts)
 * and the build (scripts/vite-plugin-static-course.ts), so they can't disagree:
 *  1. `VITE_DATA_LAYER` ("couch" | "static"), if set;
 *  2. else "couch" if a CouchDB URL is configured (`VITE_COUCH_BASE_URL` or
 *     `VITE_COUCHDB_SERVER`): a deployment or dev setup that names a server
 *     wants it;
 *  3. else `fallback`, skuilder.config.json's `dataLayerType` ("static": a
 *     fresh clone runs on the packed course in public/static-courses/).
 */
export type DataLayerType = "couch" | "static";

export function resolveDataLayerType(
  env: Record<string, string | undefined>,
  fallback: DataLayerType,
): DataLayerType {
  const explicit = env.VITE_DATA_LAYER;
  if (explicit === "couch" || explicit === "static") return explicit;
  if (explicit) throw new Error(`Invalid VITE_DATA_LAYER: ${explicit}`);
  if (env.VITE_COUCH_BASE_URL || env.VITE_COUCHDB_SERVER) return "couch";
  return fallback;
}
