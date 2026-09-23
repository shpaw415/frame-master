"server only";

import type { getDb } from "db/index";
import { parseTemplate, parseTemplateToDB } from "db/parse";
import { templates as DBTemplates, type parsedTemplate } from "db/schema";
import { and, eq } from "drizzle-orm";
import { ListingError, resolveOwnedWrite } from "@/actions/api/cli/access";
import { requireActiveGitHubAppLinkForRepo } from "@/actions/api/github/app/utils";
import { resolveTemplateMetadata } from "./metadata";

type Db = ReturnType<typeof getDb>;

export type CreateTemplateUserInput = Omit<
	parsedTemplate,
	| "id"
	| "ownerId"
	| "createdAt"
	| "updatedAt"
	| "defaultVersion"
	| "githubReleaseUrl"
>;

type UpdateTemplateFields = Partial<Omit<parsedTemplate, "id">> & { id: number };

async function assertGitHubApp(params: {
	db: Db;
	githubUrl: string;
	userId: string;
}) {
	try {
		await requireActiveGitHubAppLinkForRepo(params);
	} catch (error) {
		throw new ListingError((error as Error).message, {
			code: "github_app_required",
			installPath: "/settings",
			status: 409,
		});
	}
}

async function insertTemplate(params: {
	data: CreateTemplateUserInput;
	db: Db;
	userId: string;
}) {
	await assertGitHubApp({
		db: params.db,
		githubUrl: params.data.githubRepoUrl || "",
		userId: params.userId,
	});
	const metadata = await resolveTemplateMetadata({
		githubRepoUrl: params.data.githubRepoUrl || "",
	});
	const now = new Date();
	const {
		id: _id,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		name,
		description,
		author,
		category,
		tags,
		...authorizedUserInput
	} = params.data as parsedTemplate;

	const created = await params.db
		.insert(DBTemplates)
		.values(
			parseTemplateToDB({
				...authorizedUserInput,
				author: author || "",
				category: category || "",
				createdAt: now,
				defaultVersion: metadata.defaultVersion,
				description: description || "",
				githubReleaseUrl: metadata.githubReleaseUrl,
				githubRepoUrl: metadata.githubRepoUrl,
				name: name || "",
				ownerId: params.userId,
				tags: tags || [],
				updatedAt: now,
			}) as typeof DBTemplates.$inferInsert,
		)
		.returning()
		.get();

	if (!created) throw new Error("Failed to create template record");
	return parseTemplate(created);
}

export async function createTemplateListing(params: {
	data: CreateTemplateUserInput;
	db: Db;
	userId: string;
}): Promise<{
	fields?: Array<keyof parsedTemplate>;
	message: string;
	success: boolean;
}> {
	const existing = await params.db
		.select()
		.from(DBTemplates)
		.where(eq(DBTemplates.name, params.data.name))
		.get();

	if (existing) {
		return {
			fields: ["name"],
			message: "Template with this name already exists",
			success: false,
		};
	}

	await insertTemplate(params);
	return { message: "Template created successfully", success: true };
}

export async function updateTemplateListing(params: {
	data: UpdateTemplateFields;
	db: Db;
	role?: string | null;
	userId: string;
}): Promise<{
	data?: parsedTemplate;
	error?: string;
	message?: string;
	success: boolean;
}> {
	const existing = await params.db
		.select()
		.from(DBTemplates)
		.where(
			params.role === "admin"
				? eq(DBTemplates.id, params.data.id)
				: and(
						eq(DBTemplates.id, params.data.id),
						eq(DBTemplates.ownerId, params.userId),
					),
		)
		.get();

	if (!existing) {
		return { error: "Template not found", success: false };
	}

	await assertGitHubApp({
		db: params.db,
		githubUrl: params.data.githubRepoUrl || existing.githubRepoUrl,
		userId: params.userId,
	});
	const metadata = await resolveTemplateMetadata({
		githubRepoUrl: params.data.githubRepoUrl || existing.githubRepoUrl,
	});
	const {
		id: _id,
		ownerId: _ownerId,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		defaultVersion: _defaultVersion,
		githubReleaseUrl: _githubReleaseUrl,
		...acceptedFields
	} = params.data;

	const updated = await params.db
		.update(DBTemplates)
		.set(
			parseTemplateToDB({
				...acceptedFields,
				defaultVersion: metadata.defaultVersion,
				githubReleaseUrl: metadata.githubReleaseUrl,
				githubRepoUrl: metadata.githubRepoUrl,
				updatedAt: new Date(),
			}),
		)
		.where(eq(DBTemplates.id, params.data.id))
		.returning()
		.get();

	if (!updated) {
		return { error: "Failed to fetch updated template", success: false };
	}

	return {
		data: parseTemplate(updated),
		message: "Template updated successfully",
		success: true,
	};
}

export async function upsertTemplateListing(params: {
	data: CreateTemplateUserInput;
	db: Db;
	userId: string;
}): Promise<{ created: boolean; template: parsedTemplate }> {
	const existing = await params.db
		.select()
		.from(DBTemplates)
		.where(eq(DBTemplates.name, params.data.name))
		.get();
	const action = resolveOwnedWrite(existing?.ownerId ?? null, params.userId);

	if (action === "forbidden") {
		throw new ListingError(
			"Template with this name is owned by another account",
			{ code: "forbidden", status: 403 },
		);
	}

	if (action === "create") {
		return { created: true, template: await insertTemplate(params) };
	}

	const updated = await updateTemplateListing({
		data: { ...params.data, id: existing!.id },
		db: params.db,
		role: "user",
		userId: params.userId,
	});
	if (!updated.success || !updated.data) {
		throw new ListingError(updated.error || "Failed to update template", {
			code: "update_failed",
			status: 400,
		});
	}
	return { created: false, template: updated.data };
}
