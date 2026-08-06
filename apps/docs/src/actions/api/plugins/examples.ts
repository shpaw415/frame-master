import { getDb } from "db/index";
import { plugins } from "db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { APIError, logError } from "@/action_ext/utils";
import { fetchRepositoryExamples } from "./metadata";

type ExampleSource = "manual" | "missing" | "repository";

type ExampleResponse = {
	configurationExample: string | null;
	configurationSource: ExampleSource;
	quickExample: string | null;
	quickExampleSource: ExampleSource;
	success: boolean;
};

export async function getExample(params?: {
	id?: number | string;
	db: D1Database;
}): Promise<ExampleResponse | APIError<ExampleResponse>> {
	const defaultResponse: ExampleResponse = {
		configurationExample: null,
		configurationSource: "missing",
		quickExample: null,
		quickExampleSource: "missing",
		success: false,
	};

	if (!params?.id) {
		return defaultResponse;
	}
	try {
		const db = getDb(params.db);
		const plugin = await db
			.select({
				configuration: plugins.configuration,
				githubUrl: plugins.githubUrl,
				quickStart: plugins.quickStart,
			})
			.from(plugins)
			.where(eq(plugins.id, Number(params.id)))
			.get();

		if (!plugin) {
			return defaultResponse;
		}

		let repositoryQuickExample: string | null = null;
		let repositoryConfigurationExample: string | null = null;

		if (plugin.githubUrl) {
			try {
				const repositoryExamples = await fetchRepositoryExamples(
					plugin.githubUrl,
				);
				repositoryQuickExample = repositoryExamples.quickExample;
				repositoryConfigurationExample =
					repositoryExamples.configurationExample;
			} catch (error) {
				return new APIError(
					"Failed to fetch examples from GitHub repository",
					{
						error: error as Error,
						severity: "warning",
						additionalContext: { pluginId: params.id, source: "github" },
					},
					defaultResponse,
				);
			}
		}

		const quickExample = repositoryQuickExample || plugin.quickStart || null;
		const configurationExample =
			repositoryConfigurationExample || plugin.configuration || null;

		return {
			configurationExample,
			configurationSource: repositoryConfigurationExample
				? "repository"
				: plugin.configuration
					? "manual"
					: "missing",
			quickExample,
			quickExampleSource: repositoryQuickExample
				? "repository"
				: plugin.quickStart
					? "manual"
					: "missing",
			success: true,
		};
	} catch (error) {
		return new APIError(
			"An error occurred while fetching plugin examples",
			{
				error: error as Error,
				severity: "error",
				additionalContext: { pluginId: params?.id },
			},
			defaultResponse,
		);
	}
}

export async function GET(params?: {
	id?: number | string;
}): Promise<ExampleResponse> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	const result = await getExample({ id: params?.id, db: context.env.DB });

	if (result instanceof APIError) {
		await logError({
			context: context as never,
			error: result.props.error,
			endpoint: "/api/plugins/examples",
			method: "GET",
			severity: result.props.severity,
			additionalContext: result.props.additionalContext,
		});
		return {
			configurationExample: null,
			configurationSource: "missing",
			quickExample: null,
			quickExampleSource: "missing",
			success: false,
		};
	}

	return result;
}
