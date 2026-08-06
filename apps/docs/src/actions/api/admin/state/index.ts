import { getDb } from "db/index";
import { errorLogs, plugins, templates } from "db/schema";
import { count, eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { logError } from "@/action_ext/utils";
import type { ClientType } from "@/auth";

export async function GET() {
	const ctx = getContext<Cloudflare.Env, never, { client: ClientType }>(
		arguments,
	);

	const db = getDb(ctx.env.DB);

	const additionalContext: Record<string, unknown> = {};

	try {
		const userCount = await ctx.data.client
			.getUsers()
			.then((u) => (u instanceof Error ? -1 : u.data?.total));
		additionalContext.userCount = userCount ?? "unknown";
		const pluginCount = (await db.select({ count: count() }).from(plugins)).at(
			0,
		)?.count;
		additionalContext.pluginCount = pluginCount;
		const templateCount = (
			await db.select({ count: count() }).from(templates)
		).at(0)?.count;
		additionalContext.templateCount = templateCount;
		const errorLogCount = (
			await db
				.select({ count: count() })
				.from(errorLogs)
				.where(eq(errorLogs.resolved, false))
		).at(0)?.count;
		additionalContext.errorLogCount = errorLogCount;

		return {
			success: true,
			data: {
				userCount,
				pluginCount,
				templateCount,
				errorLogCount,
			},
		} as const;
	} catch (error) {
		await logError({
			context: ctx as never,
			error: error as Error,
			endpoint: "/admin/api/state",
			method: "GET",
			severity: "critical",
			additionalContext,
		});
		return {
			success: false,
			message: "Error fetching state",
			data: null,
		} as const;
	}
}
