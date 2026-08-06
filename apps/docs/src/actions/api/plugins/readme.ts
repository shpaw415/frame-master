import { getDb } from "db/index";
import { plugins } from "db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { APIError, logError } from "@/action_ext/utils";
import { fetchRepositoryReadme } from "./metadata";

type ReadmeSource = "manual" | "repository";

type ReadmeResponse = {
	content: string;
	source: ReadmeSource;
	success: boolean;
};

export async function getReadme(params?: {
	id?: number | string;
	db: D1Database;
}): Promise<ReadmeResponse | APIError<ReadmeResponse>> {
	if (!params?.id) {
		return {
			content: "",
			source: "manual",
			success: false,
		};
	}
	try {
		const db = getDb(params.db);
		const plugin = await db
			.select({
				description: plugins.description,
				githubUrl: plugins.githubUrl,
				longDescription: plugins.longDescription,
			})
			.from(plugins)
			.where(eq(plugins.id, Number(params.id)))
			.get();

		if (!plugin) {
			return {
				content: "",
				source: "manual",
				success: false,
			};
		}

		const fallbackContent = plugin.longDescription || plugin.description;

		if (plugin.githubUrl) {
			try {
				const readme = await fetchRepositoryReadme(plugin.githubUrl);
				if (readme) {
					return {
						content: readme,
						source: "repository",
						success: true,
					};
				}
			} catch (error) {
				return new APIError(
					"Failed to fetch readme from GitHub repository",
					{
						error: error as Error,
						severity: "warning",
						additionalContext: { pluginId: params.id, source: "github" },
					},
					{
						content: fallbackContent,
						source: "manual",
						success: true,
					},
				);
			}
		}

		return {
			content: fallbackContent,
			source: "manual",
			success: true,
		};
	} catch (error) {
		return new APIError(
			"Failed to fetch plugin readme",
			{
				error: error as Error,
				endpoint: "/api/plugins/readme",
				method: "GET",
				severity: "error",
				additionalContext: { pluginId: params.id },
			},
			{
				content: "",
				source: "manual",
				success: false,
			},
		);
	}
}

export async function GET(params?: { id?: number | string }): Promise<{
	content: string;
	source: ReadmeSource;
	success: boolean;
}> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	if (!params?.id) {
		return {
			content: "",
			source: "manual",
			success: false,
		};
	}

	try {
		const db = getDb(context.env.DB);
		const plugin = await db
			.select({
				description: plugins.description,
				githubUrl: plugins.githubUrl,
				longDescription: plugins.longDescription,
			})
			.from(plugins)
			.where(eq(plugins.id, Number(params.id)))
			.get();

		if (!plugin) {
			return {
				content: "",
				source: "manual",
				success: false,
			};
		}

		const fallbackContent = plugin.longDescription || plugin.description;

		if (plugin.githubUrl) {
			try {
				const readme = await fetchRepositoryReadme(plugin.githubUrl);
				if (readme) {
					return {
						content: readme,
						source: "repository",
						success: true,
					};
				}
			} catch (error) {
				await logError({
					context: context as never,
					error: error as Error,
					endpoint: "/api/plugins/readme",
					method: "GET",
					severity: "warning",
					additionalContext: { pluginId: params.id, source: "github" },
				});
			}
		}

		return {
			content: fallbackContent,
			source: "manual",
			success: true,
		};
	} catch (error) {
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/plugins/readme",
			method: "GET",
			severity: "error",
			additionalContext: { pluginId: params.id },
		});

		return {
			content: "",
			source: "manual",
			success: false,
		};
	}
}
