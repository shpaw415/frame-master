import { describe, expect, test } from "bun:test";
import { formatDebugSource } from "../src/debug/ui/src/format-debug-source";

describe("formatDebugSource", () => {
	test("pretty-prints JSON", () => {
		expect(formatDebugSource('{"a":1,"b":[2,3]}', "json")).toBe(
			`{
  "a": 1,
  "b": [
    2,
    3
  ]
}`,
		);
	});

	test("keeps invalid JSON raw", () => {
		expect(formatDebugSource("{not json", "json")).toBe("{not json");
	});

	test("leaves non-JSON languages unchanged", () => {
		const source = "const x=1;";
		expect(formatDebugSource(source, "javascript")).toBe(source);
		expect(formatDebugSource(source)).toBe(source);
	});
});
