import { describe, expect, it } from "vitest";
import { resolveDataLayerType } from "./dataLayer";

describe("resolveDataLayerType", () => {
  it("falls back with no CouchDB configured", () => {
    expect(resolveDataLayerType({}, "static")).toBe("static");
  });
  it("picks couch when a CouchDB URL is set", () => {
    expect(resolveDataLayerType({ VITE_COUCH_BASE_URL: "example.com/couch/" }, "static")).toBe("couch");
    expect(resolveDataLayerType({ VITE_COUCHDB_SERVER: "localhost:5984/" }, "static")).toBe("couch");
  });
  it("lets VITE_DATA_LAYER override either way", () => {
    expect(resolveDataLayerType({ VITE_DATA_LAYER: "static", VITE_COUCH_BASE_URL: "x/" }, "couch")).toBe("static");
    expect(resolveDataLayerType({ VITE_DATA_LAYER: "couch" }, "static")).toBe("couch");
  });
  it("rejects an unknown VITE_DATA_LAYER", () => {
    expect(() => resolveDataLayerType({ VITE_DATA_LAYER: "pouch" }, "static")).toThrow(/VITE_DATA_LAYER/);
  });
});
