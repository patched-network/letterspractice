import type { EntitlementProvider } from "./types";

/** The default: everything is open, nothing is for sale. */
export const openProvider: EntitlementProvider = {
    wordLimit: null,
    hasPaidAccess: async () => true,
    invalidate: () => {},
    offer: null,
};
