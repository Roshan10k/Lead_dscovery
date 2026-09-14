import { describe, expect, test } from "bun:test";
import { csvEscape } from "./csv";

describe("csvEscape", () => {
  test("passes plain values through unchanged", () => {
    expect(csvEscape("Clean Co")).toBe("Clean Co");
  });

  test("quotes values containing a comma", () => {
    expect(csvEscape("Sydney, Australia")).toBe('"Sydney, Australia"');
  });

  test("quotes and doubles embedded quotes", () => {
    expect(csvEscape('Say "hi"')).toBe('"Say ""hi"""');
  });

  test("quotes values containing a newline", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  test("empty string passes through unchanged", () => {
    expect(csvEscape("")).toBe("");
  });
});
