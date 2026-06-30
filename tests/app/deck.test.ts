import { describe, expect, it } from "vitest";
import {
  canButtonOccupySpan,
  clampDeckDimension,
  clampSpan,
  coveredCellIndexes,
  createEmptyDeckButtonConfig,
  effectiveButtonSpan,
  markOccupiedCells,
  normalizeDeckButtonConfig,
  normalizeDeckLayout,
  type DeckButtonConfig,
} from "../../src/app/deck";

const configured = (overrides: Partial<DeckButtonConfig> = {}): DeckButtonConfig => ({
  ...createEmptyDeckButtonConfig(),
  moduleId: "module",
  eventId: "event",
  ...overrides,
});

describe("deck normalization", () => {
  it.each([
    [0, 1],
    [-5, 1],
    [2.4, 2],
    [2.5, 3],
    [99, 16],
    [Number.NaN, 8],
    [Number.POSITIVE_INFINITY, 8],
  ])("clamps dimension %s to %s", (input, expected) => {
    expect(clampDeckDimension(input)).toBe(expected);
  });

  it("normalizes absent and partial layouts independently", () => {
    expect(normalizeDeckLayout(null)).toEqual({ rows: 8, columns: 8 });
    expect(normalizeDeckLayout({ rows: 3, columns: "20" })).toEqual({ rows: 3, columns: 16 });
    expect(normalizeDeckLayout({ rows: "bad", columns: 4 })).toEqual({ rows: 8, columns: 4 });
  });

  it.each([
    [undefined, 8, 1],
    [0, 8, 1],
    [2.6, 8, 3],
    [20, 8, 8],
  ])("clamps span %s with max %s", (input, maximum, expected) => {
    expect(clampSpan(input, maximum)).toBe(expected);
  });

  it("creates and normalizes button configs, including legacy buttons", () => {
    expect(createEmptyDeckButtonConfig()).toEqual({
      label: "",
      columnSpan: 1,
      rowSpan: 1,
      moduleId: "",
      eventId: "",
      params: {},
    });
    expect(normalizeDeckButtonConfig({ moduleId: "m", eventId: "e", params: {} })).toMatchObject({
      label: "",
      columnSpan: 1,
      rowSpan: 1,
    });
    expect(normalizeDeckButtonConfig({ moduleId: "m", eventId: "e", params: [], label: "x" }))
      .toBeUndefined();
    expect(normalizeDeckButtonConfig("bad")).toBeUndefined();
  });
});

describe("deck span layout", () => {
  const layout = { rows: 3, columns: 4 };

  it("calculates covered indexes and marks all cells except the anchor", () => {
    expect(coveredCellIndexes(1, 2, 2, layout)).toEqual([1, 2, 5, 6]);
    const occupied = new Set<number>();
    markOccupiedCells(1, 2, 2, occupied, layout);
    expect([...occupied]).toEqual([2, 5, 6]);
  });

  it("accepts empty spans and rejects bounds and configured collisions", () => {
    const buttons: Array<DeckButtonConfig | undefined> = [];
    expect(canButtonOccupySpan(1, 2, 2, layout, buttons)).toBe(true);
    expect(canButtonOccupySpan(3, 2, 1, layout, buttons)).toBe(false);
    expect(canButtonOccupySpan(9, 1, 2, layout, buttons)).toBe(false);
    buttons[6] = configured();
    expect(canButtonOccupySpan(1, 2, 2, layout, buttons)).toBe(false);
  });

  it("reduces a stale span to the largest non-colliding rectangle", () => {
    const buttons: Array<DeckButtonConfig | undefined> = [];
    const anchor = configured({ columnSpan: 3, rowSpan: 2 });
    buttons[0] = anchor;
    buttons[2] = configured();
    expect(effectiveButtonSpan(0, anchor, new Set(), layout, buttons)).toEqual({
      columnSpan: 2,
      rowSpan: 2,
    });
  });

  it("accounts for cells occupied by an earlier rendered span", () => {
    const button = configured({ columnSpan: 2, rowSpan: 2 });
    expect(effectiveButtonSpan(1, button, new Set([2, 6]), layout, [])).toEqual({
      columnSpan: 1,
      rowSpan: 2,
    });
  });
});
