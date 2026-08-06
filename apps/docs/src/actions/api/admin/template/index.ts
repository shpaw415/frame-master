import { getDb } from "db/index";
import { parseTemplateToDB } from "db/parse";
import { type parsedTemplate, templates } from "db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { logError } from "@/action_ext/utils";
import { resolveTemplateMetadata } from "@/actions/api/templates/metadata";

//////////////////
// update a template from any user
//////////////////

export async function PATCH(
	templateData: Partial<parsedTemplate> & { id: number },
): Promise<{
	success: boolean;
	error?: string;
	status?: number;
}> {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);

	try {
		const db = getDb(ctx.env.DB);
		const existingTemplate = await db
			.select()
			.from(templates)
			.where(eq(templates.id, templateData.id))
			.get();

		if (!existingTemplate) {
			return {
				success: false,
				error: "Template not found",
				status: 404,
			};
		}

		const metadata = await resolveTemplateMetadata({
			githubRepoUrl:
				templateData.githubRepoUrl || existingTemplate.githubRepoUrl,
		});

		const acceptedTemplateData = { ...templateData };
		delete acceptedTemplateData.defaultVersion;
		delete acceptedTemplateData.githubReleaseUrl;

		await db
			.update(templates)
			.set(
				parseTemplateToDB({
					...acceptedTemplateData,
					defaultVersion: metadata.defaultVersion,
					githubReleaseUrl: metadata.githubReleaseUrl,
					githubRepoUrl: metadata.githubRepoUrl,
				}),
			)
			.where(eq(templates.id, templateData.id));

		return { success: true };
	} catch (error) {
		console.error("Template PATCH error:", error);
		logError({
			context: ctx as never,
			error: error as Error,
			endpoint: "/admin/api/template",
			method: "PATCH",
			severity: "error",
			additionalContext: { templateData },
		});
		return {
			success: false,
			error: "Internal Server Error",
			status: 500,
		};
	}
}

//////////////////
// delete a template from any user
//////////////////

export async function DELETE(templateId: number): Promise<{
	success: boolean;
	error?: string;
	message?: string;
	status?: number;
}> {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);

	try {
		const db = getDb(ctx.env.DB);

		// Check if template exists
		const existing = await db
			.select()
			.from(templates)
			.where(eq(templates.id, templateId))
			.get();

		if (!existing) {
			return {
				success: false,
				error: "Template not found",
				status: 404,
			};
		}

		// Delete template
		await db.delete(templates).where(eq(templates.id, templateId)).run();

		return {
			success: true,
			message: "Template deleted successfully",
		};
	} catch (error) {
		console.error("Admin template DELETE error:", error);
		await logError({
			context: ctx as never,
			error: error as Error,
			endpoint: "/admin/api/template",
			method: "DELETE",
			severity: "error",
			additionalContext: { templateId },
		});
		return {
			success: false,
			error: "Failed to delete template",
			status: 500,
		};
	}
}
