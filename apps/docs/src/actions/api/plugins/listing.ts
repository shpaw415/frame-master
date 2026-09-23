"server only";

import type { getDb } from "db/index";
import { parsePlugin, parsePluginsToDB } from "db/parse";
import { plugins as DBPlugins, type parsedPlugin } from "db/schema";
import { and, eq } from "drizzle-orm";
import { ListingError, resolveOwnedWrite } from "@/actions/api/cli/access";
import { requireActiveGitHubAppLinkForRepo } from "@/actions/api/github/app/utils";
import { replacePluginVersionHistory, resolvePluginMetadata } from "./metadata";

type Db = ReturnType<typeof getDb>;

export type CreatePluginUserInput = Omit<
	parsedPlugin,
	| "id"
	| "downloads"
	| "ownerId"
	| "createdAt"
	| "updatedAt"
	| "upvote"
	| "downvote"
	| "version"
>;

type UpdatePluginFields = Partial<Omit<parsedPlugin, "id">> & { id: number };

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

async function insertPlugin(params: {
	data: CreatePluginUserInput;
	db: Db;
	userId: string;
}) {
	await assertGitHubApp({
		db: params.db,
		githubUrl: params.data.githubUrl || "",
		userId: params.userId,
	});
	const metadata = await resolvePluginMetadata({
		githubUrl: params.data.githubUrl || "",
		npmPackage: params.data.npmPackage || "",
	});
	const now = new Date();
	const {
		id: _id,
		downloads: _downloads,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		downvote: _downvote,
		upvote: _upvote,
		name,
		description,
		compatibleVersions,
		author,
		category,
		tags,
		...authorizedUserInput
	} = params.data as parsedPlugin;

	const created = await params.db
		.insert(DBPlugins)
		.values(
			parsePluginsToDB({
				...authorizedUserInput,
				author: author || "",
				category: category || "",
				compatibleVersions: compatibleVersions || "",
				createdAt: now,
				description: description || "",
				githubUrl: metadata.githubUrl,
				name: name || "",
				npmPackage: metadata.npmPackage,
				ownerId: params.userId,
				tags: tags || [],
				updatedAt: now,
				version: metadata.latestVersion,
			}) as typeof DBPlugins.$inferInsert,
		)
		.returning()
		.get();

	if (!created) throw new Error("Failed to create plugin record");

	await replacePluginVersionHistory({
		db: params.db,
		pluginId: created.id,
		versions: metadata.versions,
	});

	return parsePlugin(created);
}

export async function createPluginListing(params: {
	data: CreatePluginUserInput;
	db: Db;
	userId: string;
}): Promise<{
	fields?: Array<keyof parsedPlugin>;
	message: string;
	success: boolean;
}> {
	const existing = await params.db
		.select()
		.from(DBPlugins)
		.where(eq(DBPlugins.name, params.data.name))
		.get();

	if (existing) {
		return {
			fields: ["name"],
			message: "Plugin with this name already exists",
			success: false,
		};
	}

	await insertPlugin(params);
	return { message: "Plugin created successfully", success: true };
}

export async function updatePluginListing(params: {
	data: UpdatePluginFields;
	db: Db;
	role?: string | null;
	userId: string;
}): Promise<{
	data?: parsedPlugin;
	error?: string;
	message?: string;
	success: boolean;
}> {
	const whereStatement =
		params.role === "admin"
			? eq(DBPlugins.id, params.data.id)
			: and(
					eq(DBPlugins.id, params.data.id),
					eq(DBPlugins.ownerId, params.userId),
				);
	const existing = await params.db
		.select()
		.from(DBPlugins)
		.where(whereStatement)
		.get();

	if (!existing) {
		return { error: "Plugin not found", success: false };
	}

	await assertGitHubApp({
		db: params.db,
		githubUrl: params.data.githubUrl || existing.githubUrl || "",
		userId: params.userId,
	});
	const metadata = await resolvePluginMetadata({
		githubUrl: params.data.githubUrl || existing.githubUrl || "",
		npmPackage: params.data.npmPackage || existing.npmPackage,
	});
	const {
		id: _id,
		downloads: _downloads,
		ownerId: _ownerId,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		upvote: _upvote,
		downvote: _downvote,
		version: _version,
		...acceptedFields
	} = params.data;

	const updated = await params.db
		.update(DBPlugins)
		.set(
			parsePluginsToDB({
				...acceptedFields,
				githubUrl: metadata.githubUrl,
				npmPackage: metadata.npmPackage,
				updatedAt: new Date(),
				version: metadata.latestVersion,
			}),
		)
		.where(eq(DBPlugins.id, params.data.id))
		.returning()
		.get();

	if (!updated) {
		return { error: "Failed to fetch updated plugin", success: false };
	}

	await replacePluginVersionHistory({
		db: params.db,
		pluginId: updated.id,
		versions: metadata.versions,
	});

	return {
		data: parsePlugin(updated),
		message: "Plugin updated successfully",
		success: true,
	};
}

export async function upsertPluginListing(params: {
	data: CreatePluginUserInput;
	db: Db;
	userId: string;
}): Promise<{ created: boolean; plugin: parsedPlugin }> {
	const existing = await params.db
		.select()
		.from(DBPlugins)
		.where(eq(DBPlugins.name, params.data.name))
		.get();
	const action = resolveOwnedWrite(existing?.ownerId ?? null, params.userId);

	if (action === "forbidden") {
		throw new ListingError(
			"Plugin with this name is owned by another account",
			{ code: "forbidden", status: 403 },
		);
	}

	if (action === "create") {
		return { created: true, plugin: await insertPlugin(params) };
	}

	const updated = await updatePluginListing({
		data: { ...params.data, id: existing!.id },
		db: params.db,
		role: "user",
		userId: params.userId,
	});
	if (!updated.success || !updated.data) {
		throw new ListingError(updated.error || "Failed to update plugin", {
			code: "update_failed",
			status: 400,
		});
	}
	return { created: false, plugin: updated.data };
}
