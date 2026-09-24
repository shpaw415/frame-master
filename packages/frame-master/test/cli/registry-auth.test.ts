import { describe, expect, test } from "bun:test";
import { resolveOwnedWrite } from "../../../../apps/docs/src/actions/api/cli/access";

describe("CLI listing access", () => {
	test("creates, updates, or forbids by owner", () => {
		expect(resolveOwnedWrite(null, "user-1")).toBe("create");
		expect(resolveOwnedWrite("user-1", "user-1")).toBe("update");
		expect(resolveOwnedWrite("user-2", "user-1")).toBe("forbidden");
	});
});
