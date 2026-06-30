import { describe, expect, it } from "vitest";
import { errorMessage, escapeHtml, formatConsoleValue } from "../../src/app/format";

describe("format helpers", () => {
  it("escapes every HTML-sensitive character", () => {
    expect(escapeHtml(`<script a="x" b='y'>&`)).toBe(
      "&lt;script a=&quot;x&quot; b=&#039;y&#039;&gt;&amp;",
    );
  });

  it("formats strings, JSON values, undefined, BigInt, and circular objects", () => {
    expect(formatConsoleValue("plain")).toBe("plain");
    expect(formatConsoleValue({ a: 1 })).toBe('{"a":1}');
    expect(formatConsoleValue(undefined)).toBe("undefined");
    expect(formatConsoleValue(2n)).toBe("2");
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(formatConsoleValue(circular)).toBe("[object Object]");
  });

  it("extracts Error messages and stringifies other thrown values", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("nope")).toBe("nope");
  });
});
