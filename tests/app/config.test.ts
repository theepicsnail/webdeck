import { describe, expect, it } from "vitest";
import {
  isWebDeckModule,
  normalizeExternalModule,
  normalizeImportedModuleConfig,
  normalizeStringRecord,
  parseExportConfig,
} from "../../src/app/config";

const base = () => ({
  schemaVersion: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  modules: [],
  customModuleUrls: [],
  deckLayout: { rows: 2, columns: 3 },
  deckButtons: [],
});

describe("module validation", () => {
  it("accepts the shallow public module contract", () => {
    expect(isWebDeckModule({ id: "x", name: "X", description: "test", configFields: [] }))
      .toBe(true);
  });

  it.each([null, {}, { id: 1, name: "X", description: "", configFields: [] }, {
    id: "x", name: "X", description: "", configFields: null,
  }])("rejects invalid candidates", (candidate) => {
    expect(isWebDeckModule(candidate)).toBe(false);
  });

  it("normalizes default and named module namespaces with default precedence", () => {
    const named = { id: "named", name: "Named", description: "", configFields: [] };
    const preferred = { id: "default", name: "Default", description: "", configFields: [] };
    expect(normalizeExternalModule({ webDeckModule: named })).toBe(named);
    expect(normalizeExternalModule({ default: preferred, webDeckModule: named })).toBe(preferred);
    expect(() => normalizeExternalModule({ default: {} })).toThrow("does not match");
  });
});

describe("export config parsing", () => {
  it("normalizes a valid config and grows buttons to the layout", () => {
    const result = parseExportConfig({
      ...base(),
      exportedAt: 5,
      customModuleUrls: ["/ok.js", 4, null],
      modules: [{ id: "m", enabled: true, config: { host: "local", port: 4 } }],
      deckButtons: [{ moduleId: "m", eventId: "e", params: {}, label: "Go" }],
    });
    expect(result.exportedAt).toBe("");
    expect(result.customModuleUrls).toEqual(["/ok.js"]);
    expect(result.modules).toEqual([{ id: "m", enabled: true, config: { host: "local" } }]);
    expect(result.deckButtons).toHaveLength(6);
    expect(result.deckButtons[0]).toMatchObject({ label: "Go", columnSpan: 1, rowSpan: 1 });
  });

  it("normalizes records and module defaults", () => {
    expect(normalizeStringRecord({ a: "yes", b: 2, c: false })).toEqual({ a: "yes" });
    expect(normalizeImportedModuleConfig({ id: "m", enabled: "true", config: [] })).toEqual({
      id: "m", enabled: false, config: {},
    });
  });

  it.each([
    [null, "JSON object"],
    [[], "JSON object"],
    [{ ...base(), schemaVersion: 2 }, "Unsupported"],
    [{ ...base(), modules: null }, "missing modules"],
    [{ ...base(), customModuleUrls: null }, "custom module URLs"],
    [{ ...base(), deckButtons: null }, "deck buttons"],
    [{ ...base(), modules: [null] }, "must be objects"],
    [{ ...base(), modules: [{}] }, "include an id"],
  ])("rejects malformed config %#", (value, message) => {
    expect(() => parseExportConfig(value)).toThrow(message);
  });
});
