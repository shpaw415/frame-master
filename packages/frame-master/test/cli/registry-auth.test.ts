import { describe, expect, test } from "bun:test";
import { resolveOwnedWrite } from "../../../../apps/docs/src/actions/api/cli/access";
import {
	approveDeviceLogin,
	beginDeviceLogin,
	pollDeviceLogin,
	type DeviceCodeRecord,
	type DeviceStore,
} from "../../../../apps/docs/src/actions/api/cli/device";

function memoryStore(): DeviceStore & { records: DeviceCodeRecord[] } {
	const records: DeviceCodeRecord[] = [];
	let nextId = 1;
	return {
		records,
		async insert(record) {
			if (records.some((row) => row.userCode === record.userCode)) {
				throw new Error("user code collision");
			}
			const created = { ...record, id: nextId++ };
			records.push(created);
			return created;
		},
		async findByUserCode(userCode) {
			return records.find((row) => row.userCode === userCode) ?? null;
		},
		async findByDeviceHash(deviceCodeHash) {
			return records.find((row) => row.deviceCodeHash === deviceCodeHash) ?? null;
		},
		async approve(id, userId) {
			const row = records.find((item) => item.id === id);
			if (!row || row.status !== "pending") return false;
			row.status = "approved";
			row.userId = userId;
			return true;
		},
		async consume(id) {
			const row = records.find((item) => item.id === id);
			if (!row || row.status !== "approved") return false;
			row.status = "consumed";
			return true;
		},
	};
}

describe("CLI listing access", () => {
	test("creates, updates, or forbids by owner", () => {
		expect(resolveOwnedWrite(null, "user-1")).toBe("create");
		expect(resolveOwnedWrite("user-1", "user-1")).toBe("update");
		expect(resolveOwnedWrite("user-2", "user-1")).toBe("forbidden");
	});
});

describe("CLI device login", () => {
	test("approves a pending code and issues the token once", async () => {
		const store = memoryStore();
		const started = await beginDeviceLogin(store);
		expect(started.userCode).toHaveLength(8);

		const pending = await pollDeviceLogin(store, started.deviceCode);
		expect(pending).toEqual({ status: "pending" });

		const approved = await approveDeviceLogin(
			store,
			started.userCode,
			"user-1",
		);
		expect(approved).toEqual({ ok: true });

		const first = await pollDeviceLogin(store, started.deviceCode);
		expect(first).toEqual({ status: "approved", userId: "user-1" });

		const second = await pollDeviceLogin(store, started.deviceCode);
		expect(second).toEqual({ status: "consumed" });
	});

	test("rejects an expired code", async () => {
		const store = memoryStore();
		const started = await beginDeviceLogin(
			store,
			new Date(Date.now() - 11 * 60 * 1000),
		);
		const result = await approveDeviceLogin(store, started.userCode, "user-1");
		expect(result).toMatchObject({ ok: false, status: 410 });
	});
});
