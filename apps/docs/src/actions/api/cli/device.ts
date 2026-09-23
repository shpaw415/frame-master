"no action";

export const CLI_AUTH_TTL_MS = 10 * 60 * 1000;
export const CLI_AUTH_INTERVAL_SECONDS = 2;
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type DeviceCodeStatus = "pending" | "approved" | "consumed";

export type DeviceCodeRecord = {
	id: number;
	deviceCodeHash: string;
	userCode: string;
	userId: string | null;
	status: DeviceCodeStatus;
	expiresAt: Date;
};

export type DeviceStore = {
	insert(record: Omit<DeviceCodeRecord, "id">): Promise<DeviceCodeRecord>;
	findByUserCode(userCode: string): Promise<DeviceCodeRecord | null>;
	findByDeviceHash(deviceCodeHash: string): Promise<DeviceCodeRecord | null>;
	approve(id: number, userId: string): Promise<boolean>;
	consume(id: number): Promise<boolean>;
};

export type DevicePollResult =
	| { status: "pending" }
	| { status: "approved"; userId: string }
	| { status: "expired" | "consumed" | "invalid" };

export function randomHex(bytes: number): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomUserCode(): string {
	const buffer = new Uint8Array(8);
	crypto.getRandomValues(buffer);
	return [...buffer]
		.map((byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length])
		.join("");
}

export function normalizeUserCode(input: string): string {
	return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function formatUserCode(normalized: string): string {
	return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
	return expiresAt.getTime() <= now.getTime();
}

export async function beginDeviceLogin(
	store: DeviceStore,
	now = new Date(),
): Promise<{ deviceCode: string; expiresAt: Date; userCode: string }> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const deviceCode = randomHex(32);
		const userCode = randomUserCode();
		try {
			await store.insert({
				deviceCodeHash: await sha256Hex(deviceCode),
				expiresAt: new Date(now.getTime() + CLI_AUTH_TTL_MS),
				status: "pending",
				userCode,
				userId: null,
			});
			return {
				deviceCode,
				expiresAt: new Date(now.getTime() + CLI_AUTH_TTL_MS),
				userCode,
			};
		} catch {
			// Retry on a user-code or device-hash collision.
		}
	}

	throw new Error("Failed to start CLI login");
}

export async function approveDeviceLogin(
	store: DeviceStore,
	userCode: string,
	userId: string,
	now = new Date(),
): Promise<{ ok: true } | { error: string; ok: false; status: number }> {
	const normalized = normalizeUserCode(userCode);
	const record = await store.findByUserCode(normalized);
	if (!record || isExpired(record.expiresAt, now)) {
		return { error: "CLI login code expired", ok: false, status: 410 };
	}
	if (record.status === "consumed") {
		return { error: "CLI login code already used", ok: false, status: 410 };
	}
	if (record.status === "approved") {
		return { ok: true };
	}

	const approved = await store.approve(record.id, userId);
	if (!approved) {
		return { error: "CLI login code already used", ok: false, status: 410 };
	}
	return { ok: true };
}

export async function pollDeviceLogin(
	store: DeviceStore,
	deviceCode: string,
	now = new Date(),
): Promise<DevicePollResult> {
	const record = await store.findByDeviceHash(await sha256Hex(deviceCode));
	if (!record || isExpired(record.expiresAt, now)) {
		return { status: record ? "expired" : "invalid" };
	}
	if (record.status === "pending") return { status: "pending" };
	if (record.status === "consumed") return { status: "consumed" };
	if (!record.userId) return { status: "invalid" };

	const consumed = await store.consume(record.id);
	if (!consumed) return { status: "consumed" };
	return { status: "approved", userId: record.userId };
}
