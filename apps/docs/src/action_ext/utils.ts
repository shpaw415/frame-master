import { getDb } from "db/index";
import { parseReleaseNote } from "db/parse";
import { errorLogs, plugins, rateLimits, releaseNotes } from "db/schema";
import { and, desc, eq } from "openauthster-shared/drizzle";
import type { ClientType, Roles } from "@/auth";

export function verifyAccess(
	role: Roles | null,
	allowedRoles: Roles[],
): boolean {
	if (role === null) return false;
	return allowedRoles.includes(role);
}

// ============================================================================
// ERROR LOGGING HELPER
// ============================================================================

export type LogErrorOptions = {
	context: EventContext<Env, any, any>;
	error: Error | unknown;
	endpoint?: string;
	method?: string;
	severity?: "info" | "warning" | "error" | "critical";
	additionalContext?: Record<string, any>;
	userId?: string;
};

export async function logError(options: LogErrorOptions): Promise<void> {
	const {
		context,
		error,
		endpoint,
		method,
		severity = "error",
		additionalContext,
		userId,
	} = options;

	try {
		const db = getDb(context.env.DB);

		const errorObj = error instanceof Error ? error : new Error(String(error));
		const errorMessage = errorObj.message || String(error);
		const errorStack = errorObj.stack || null;
		const errorType = errorObj.name || "Error";

		// Extract request information
		const userAgent = context.request.headers.get("user-agent") || null;
		const cfProperties = (context.request as any).cf;
		const ipAddress =
			cfProperties?.ip ||
			context.request.headers.get("cf-connecting-ip") ||
			null;

		await db
			.insert(errorLogs)
			.values({
				userId: userId || null,
				errorMessage,
				errorStack,
				errorType,
				endpoint: endpoint || context.request.url || null,
				method: method || context.request.method || null,
				userAgent,
				ipAddress,
				severity,
				context: additionalContext ?? null,
				resolved: false,
			})
			.run();
	} catch (loggingError) {
		// Fallback to console if database logging fails
		console.error("Failed to log error to database:", loggingError);
		console.error("Original error:", error);
	}
}

export function createSessionCookie(params: {
	jwt: string;
	production: boolean;
	age: number;
}): string {
	return `sb-jwt=${params.jwt}; Path=/; HttpOnly;${
		params.production ? " Secure; " : " "
	}SameSite=Strict; Max-Age=${params.age}`;
}

export class rateLimitManager {
	userId: string;
	createdAt: Date;
	limit: number;
	period: number;

	private endpoint: string;
	private used: number;
	private db: D1Database;

	constructor({
		userId,
		endpoint,
		db,
		limit,
		period,
		used,
		createdAt,
	}: {
		userId: string;
		endpoint: string;
		db: D1Database;
		createdAt: Date;
		limit: number;
		period: number;
		used: number;
	}) {
		this.userId = userId;
		this.endpoint = endpoint;
		this.db = db;
		this.limit = limit;
		this.period = period;
		this.used = used;
		this.createdAt = createdAt;
	}

	static async create({
		userId,
		endpoint,
		db,
		defaults,
	}: {
		userId: string;
		endpoint: string;
		db: D1Database;
		defaults: { period: number; limit: number; used: number };
	}): Promise<rateLimitManager> {
		const _db = getDb(db);
		let entry = await _db
			.select({
				createdAt: rateLimits.createdAt,
				limit: rateLimits.limit,
				period: rateLimits.period,
				used: rateLimits.used,
			})
			.from(rateLimits)
			.where(
				and(eq(rateLimits.userId, userId), eq(rateLimits.endpoint, endpoint)),
			)
			.get();

		if (!entry) {
			entry = (
				await _db
					.insert(rateLimits)
					.values({
						userId,
						endpoint,
						createdAt: new Date(),
						limit: defaults.limit,
						period: defaults.period,
						used: defaults.used,
					})
					.returning({
						createdAt: rateLimits.createdAt,
						limit: rateLimits.limit,
						period: rateLimits.period,
						used: rateLimits.used,
					})
			).at(0);
		}

		return new rateLimitManager({
			db,
			userId,
			endpoint,
			createdAt: entry ? entry.createdAt : new Date(),
			limit: entry ? entry.limit : defaults.limit,
			period: entry ? entry.period : defaults.period,
			used: entry ? entry.used : defaults.used,
		});
	}

	canProceed(): boolean {
		if (this.isExpired()) {
			return true;
		}
		return this.used < this.limit;
	}

	nextPeriod(): Date {
		return new Date(this.createdAt.getTime() + this.period * 1000);
	}

	timeUntilReset() {
		const now = new Date();
		const resetAt = this.nextPeriod();
		return Math.max(0, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
	}

	setLimit(limit: number): void {
		this.limit = limit;
	}
	setPeriod(period: number): void {
		this.period = period;
	}

	isExpired(): boolean {
		const now = new Date();
		const expiryDate = new Date(this.createdAt.getTime() + this.period * 1000);
		return now >= expiryDate;
	}

	reset() {
		return getDb(this.db)
			.update(rateLimits)
			.set({
				used: 0,
				createdAt: new Date(),
			})
			.where(
				and(
					eq(rateLimits.userId, this.userId),
					eq(rateLimits.endpoint, this.endpoint),
				),
			)
			.run();
	}

	increment(): void {
		this.used += 1;
	}

	remaining(): number {
		return Math.max(this.limit - this.used, 0);
	}

	getResetAt(): Date {
		return new Date(this.createdAt.getTime() + this.period * 1000);
	}

	upsert() {
		const isExipred = this.isExpired();
		return getDb(this.db)
			.update(rateLimits)
			.set({
				used: isExipred ? 0 : this.used,
				createdAt: isExipred ? new Date() : this.createdAt,
				limit: this.limit,
				period: this.period,
			})
			.where(
				and(
					eq(rateLimits.userId, this.userId),
					eq(rateLimits.endpoint, this.endpoint),
				),
			);
	}
}

export async function deleteUser(
	userId: string,
	_db: D1Database,
	client: ClientType,
) {
	const db = getDb(_db);
	await db
		.update(plugins)
		.set({ author: "Unknown", ownerId: "Unknown" })
		.where(eq(plugins.ownerId, userId))
		.run();

	const res = await client.deleteUserById(userId);

	if (!res.success || res.error) {
		throw new Error(`Failed to delete user: ${res.error || "Unknown error"}`);
	}

	return { success: true, message: "Account deleted successfully" };
}

export async function getReleaseNotes({
	id,
	db,
}: {
	id?: number;
	db: D1Database;
}) {
	const _db = getDb(db);

	const dbQuery = _db.select().from(releaseNotes);
	if (id) {
		const note = await dbQuery.where(eq(releaseNotes.id, id)).get();
		if (!note) {
			return {
				success: false as const,
				data: [] as const,
				message: "Release note not found",
			};
		}
		return {
			success: true as const,
			data: [parseReleaseNote(note)],
		};
	}
	const notes = await dbQuery.orderBy(desc(releaseNotes.releasedAt));
	return {
		success: true as const,
		data: notes.map(parseReleaseNote),
	};
}

export class APIError<DefaultRes = undefined> extends Error {
	props: Omit<LogErrorOptions, "context">;
	defaultRes: DefaultRes;

	constructor(
		message: string,
		props: Omit<LogErrorOptions, "context">,
		defaultRes: DefaultRes = undefined as DefaultRes,
	) {
		super(message);
		this.props = props;
		this.defaultRes = defaultRes as DefaultRes;
	}
	/**
	 * Helper method to log the error using the stored properties and provided context. This allows for consistent error logging throughout the application, even when only an instance of APIError is available without direct access to the logging function.
	 */
	log(
		context: EventContext<Env, any, any>,
		options?: Omit<Partial<LogErrorOptions>, "context">,
	) {
		return logError({
			...this.props,
			...options,
			context,
		});
	}
}
