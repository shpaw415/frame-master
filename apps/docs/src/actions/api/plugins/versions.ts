import { getDb } from "db/index";
import { pluginVersions } from "db/schema";
import { desc, eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { APIError, logError } from "@/action_ext/utils";

type VersionsResponse = {
	success: boolean;
	versions: string[];
};

export async function getVersions(params: {
	id?: number | string;
	db: D1Database;
}): Promise<VersionsResponse | APIError<VersionsResponse>> {
	if (!params?.id) {
		return {
			success: false,
			versions: [],
		};
	}
	try {
		const db = getDb(params.db);
		const rows = await db
			.select({
				version: pluginVersions.version,
			})
			.from(pluginVersions)
			.where(eq(pluginVersions.pluginId, String(params.id)))
			.orderBy(desc(pluginVersions.releasedAt));

		return {
			success: true,
			versions: rows.map((row) => row.version),
		};
	} catch (error) {
		return new APIError(
			"Failed to fetch plugin versions",
			{
				error: error as Error,
				severity: "error",
				additionalContext: { pluginId: params.id },
			},
			{
				success: false,
				versions: [],
			},
		);
	}
}

export async function GET(params?: {
	id?: number | string;
}): Promise<VersionsResponse> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	if (!params?.id) {
		return {
			success: false,
			versions: [],
		};
	}

	try {
		const db = getDb(context.env.DB);
		const rows = await db
			.select({
				version: pluginVersions.version,
			})
			.from(pluginVersions)
			.where(eq(pluginVersions.pluginId, String(params.id)))
			.orderBy(desc(pluginVersions.releasedAt));

		return {
			success: true,
			versions: rows.map((row) => row.version),
		};
	} catch (error) {
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/plugins/versions",
			method: "GET",
			severity: "error",
			additionalContext: { pluginId: params.id },
		});

		return {
			success: false,
			versions: [],
		};
	}
}
