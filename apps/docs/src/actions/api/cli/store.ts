"server only";

import type { getDb } from "db/index";
import { cliAuthCodes, cliTokens } from "db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { DeviceCodeRecord, DeviceStore } from "./device";

type Db = ReturnType<typeof getDb>;

export function createDeviceStore(db: Db): DeviceStore {
	return {
		async insert(record) {
			const created = await db
				.insert(cliAuthCodes)
				.values(record)
				.returning()
				.get();
			if (!created) throw new Error("Failed to store CLI login code");
			return created as DeviceCodeRecord;
		},
		async findByUserCode(userCode) {
			const row = await db
				.select()
				.from(cliAuthCodes)
				.where(eq(cliAuthCodes.userCode, userCode))
				.get();
			return (row as DeviceCodeRecord | undefined) ?? null;
		},
		async findByDeviceHash(deviceCodeHash) {
			const row = await db
				.select()
				.from(cliAuthCodes)
				.where(eq(cliAuthCodes.deviceCodeHash, deviceCodeHash))
				.get();
			return (row as DeviceCodeRecord | undefined) ?? null;
		},
		async approve(id, userId) {
			const updated = await db
				.update(cliAuthCodes)
				.set({ status: "approved", userId })
				.where(and(eq(cliAuthCodes.id, id), eq(cliAuthCodes.status, "pending")))
				.returning({ id: cliAuthCodes.id })
				.get();
			return Boolean(updated);
		},
		async consume(id) {
			const updated = await db
				.update(cliAuthCodes)
				.set({ status: "consumed" })
				.where(and(eq(cliAuthCodes.id, id), eq(cliAuthCodes.status, "approved")))
				.returning({ id: cliAuthCodes.id })
				.get();
			return Boolean(updated);
		},
	};
}

export async function insertCliToken(params: {
	db: Db;
	tokenHash: string;
	userId: string;
}) {
	await params.db.insert(cliTokens).values({
		tokenHash: params.tokenHash,
		userId: params.userId,
	});
}

export async function findActiveCliToken(params: {
	db: Db;
	tokenHash: string;
}) {
	return (
		(await params.db
			.select()
			.from(cliTokens)
			.where(
				and(eq(cliTokens.tokenHash, params.tokenHash), isNull(cliTokens.revokedAt)),
			)
			.get()) ?? null
	);
}

export async function touchCliToken(params: { db: Db; tokenHash: string }) {
	await params.db
		.update(cliTokens)
		.set({ lastUsedAt: new Date() })
		.where(eq(cliTokens.tokenHash, params.tokenHash));
}

export async function revokeCliToken(params: { db: Db; tokenHash: string }) {
	await params.db
		.update(cliTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(eq(cliTokens.tokenHash, params.tokenHash), isNull(cliTokens.revokedAt)),
		);
}
