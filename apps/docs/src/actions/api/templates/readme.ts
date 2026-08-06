import { getDb } from "db/index";
import { templates } from "db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { APIError, logError } from "@/action_ext/utils";
import { fetchTemplateRepositoryReadme } from "./metadata";

type ReadmeSource = "manual" | "repository";

type TemplateReadmeResponse = {
	content: string;
	source: ReadmeSource;
	success: boolean;
};
type TemplateReadmeParams = {
	id?: number | string;
};

export async function getTemplateReadme(
	params: TemplateReadmeParams & { db: D1Database },
): Promise<TemplateReadmeResponse | APIError<TemplateReadmeResponse>> {
	const db = getDb(params.db);

	const defaultResponse: TemplateReadmeResponse = {
		content: "",
		source: "manual",
		success: false,
	};

	if (!params.id) {
		return defaultResponse;
	}

	try {
		const template = await db
			.select({
				description: templates.description,
				githubRepoUrl: templates.githubRepoUrl,
				longDescription: templates.longDescription,
			})
			.from(templates)
			.where(eq(templates.id, Number(params.id)))
			.get();

		if (!template) {
			return defaultResponse;
		}

		const fallbackContent = template.longDescription || template.description;

		if (template.githubRepoUrl) {
			try {
				const readme = await fetchTemplateRepositoryReadme(
					template.githubRepoUrl,
				);
				if (readme) {
					return {
						content: readme,
						source: "repository",
						success: true,
					};
				}
			} catch (error) {
				return new APIError(
					"Failed to fetch README from repository",
					{
						error,
						severity: "warning",
						additionalContext: { source: "github", templateId: params.id },
					},
					defaultResponse,
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
			"Failed to fetch template README",
			{
				error,
				severity: "error",
				additionalContext: { templateId: params.id },
			},
			defaultResponse,
		);
	}
}

export async function GET(
	params?: TemplateReadmeParams,
): Promise<TemplateReadmeResponse> {
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
		const template = await db
			.select({
				description: templates.description,
				githubRepoUrl: templates.githubRepoUrl,
				longDescription: templates.longDescription,
			})
			.from(templates)
			.where(eq(templates.id, Number(params.id)))
			.get();

		if (!template) {
			return {
				content: "",
				source: "manual",
				success: false,
			};
		}

		const fallbackContent = template.longDescription || template.description;

		if (template.githubRepoUrl) {
			try {
				const readme = await fetchTemplateRepositoryReadme(
					template.githubRepoUrl,
				);
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
					endpoint: "/api/templates/readme",
					method: "GET",
					severity: "warning",
					additionalContext: { source: "github", templateId: params.id },
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
			endpoint: "/api/templates/readme",
			method: "GET",
			severity: "error",
			additionalContext: { templateId: params.id },
		});

		return {
			content: "",
			source: "manual",
			success: false,
		};
	}
}
