/**
 * The entitlement seam: everything the app needs to know about paid access,
 * and nothing about how it's sold.
 *
 * The app ships with an open provider (./open.ts): no limit, nothing for
 * sale. A deployment that sells access supplies its own as `entitlement` in
 * its overlay (src/deployment/), along with the routes it needs (checkout,
 * payment return, gifting).
 */
export interface EntitlementProvider {
    /**
     * Ceiling on NEW content for accounts without paid access, in reachable
     * words (services/dripGate.ts). Null: no ceiling, the drip never freezes.
     */
    wordLimit: number | null;

    /**
     * Does the signed-in account hold paid access? Only asked once the
     * account has reached `wordLimit`. Must resolve `false` rather than throw
     * on failure; the gate fails open regardless.
     */
    hasPaidAccess(): Promise<boolean>;

    /** Drop any cached answer, e.g. after a purchase completes. */
    invalidate(): void;

    /** What's for sale, for the buy buttons. Null: nothing, and no buy buttons anywhere. */
    offer: EntitlementOffer | null;
}

export interface EntitlementOffer {
    /** App path of the purchase page. */
    path: string;
    /** Price as shown in buttons, e.g. "$20". */
    price: string;
    /** App path for buying gifts, offered to accounts with paid access. Null: no gifting. */
    giftPath: string | null;
}
