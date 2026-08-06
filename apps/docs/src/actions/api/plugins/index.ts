import { getDb } from "db/index";
import { parsePlugin, parsePluginsToDB } from "db/parse";
import { plugins as DBPlugins, type parsedPlugin, plugins } from "db/schema";
import { and, eq, gt, like, lt, or } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { logError, verifyAccess } from "@/action_ext/utils";
import { requireActiveGitHubAppLinkForRepo } from "@/actions/api/github/app/utils";
import { createClient } from "@/auth";
import { replacePluginVersionHistory, resolvePluginMetadata } from "./metadata";

// ============================================================================
// GET - Fetch all plugins or specific plugin
// ============================================================================

export type GetPluginsParams = {
	id?: string;
	userId?: string;
	page?: number;
	pageSize?: number;
	searchQuery?: string;
	category?: string;
	tags?: string[];
	published?: boolean;
};

export type getPluginsResponse = {
	plugins: parsedPlugin[];
	success: boolean;
	message?: string;
};

export async function getPlugins(
	params: {
		db: D1Database;
	} & GetPluginsParams,
): Promise<getPluginsResponse> {
	const db = getDb(params.db);

	if (params?.id) {
		// Fetch specific plugin with owner
		const plugin = await db
			.select()
			.from(DBPlugins)
			.where(eq(DBPlugins.id, Number(params.id)))
			.get();

		if (!plugin) {
			return {
				plugins: [],
				success: false,
				message: "Plugin not found",
			};
		}

		return {
			success: true,
			plugins: [parsePlugin(plugin)],
		};
	} else if (params?.userId) {
		// Fetch all plugins for a user
		const plugins = await db
			.select()
			.from(DBPlugins)
			.where(eq(DBPlugins.ownerId, params.userId));

		return {
			success: true,
			plugins: plugins.map((p) => parsePlugin(p)),
		};
	} else {
		// Build WHERE conditions for filtering
		const whereConditions = [];

		// Only show published plugins by default (unless explicitly requesting all)
		if (params?.published !== false) {
			whereConditions.push(eq(DBPlugins.published, true));
		}

		// Category filter
		if (params?.category && params.category !== "all") {
			whereConditions.push(eq(DBPlugins.category, params.category));
		}

		// Search query filter (name, description, or tags)
		if (params?.searchQuery) {
			const searchTerm = `%${params.searchQuery.toLowerCase()}%`;
			whereConditions.push(
				or(
					like(DBPlugins.name, searchTerm),
					like(DBPlugins.description, searchTerm),
					like(DBPlugins.tags, searchTerm),
				),
			);
		}

		// Pagination
		if (params?.page && params.pageSize) {
			whereConditions.push(
				and(
					gt(DBPlugins.id, params.page * params.pageSize),
					lt(DBPlugins.id, params.page * (params.pageSize * 2)),
				),
			);
		}

		// Fetch plugins with filters
		const plugins = await db
			.select()
			.from(DBPlugins)
			.where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
			.limit(25);

		// Filter by tags in memory (since JSON tags need client-side filtering)
		let filteredPlugins = plugins.map((p) => parsePlugin(p));

		if (params?.tags && params.tags.length > 0) {
			filteredPlugins = filteredPlugins.filter((plugin) =>
				params.tags?.every((tag) => plugin.tags.includes(tag)),
			);
		}

		return {
			success: true,
			plugins: filteredPlugins,
		};
	}
}

export async function GET(params?: GetPluginsParams): Promise<{
	plugins: parsedPlugin[];
	success: boolean;
	message?: string;
}> {
	const context = getContext<Cloudflare.Env, "", never>(arguments);

	try {
		const result = await getPlugins({ db: context.env.DB, ...params });
		return result;
	} catch (error) {
		console.error("GET plugin error:", error);
		await logError({
			context: context as never,
			error,
			endpoint: "/api/plugins",
			method: "GET",
			severity: "error",
			additionalContext: { params },
		});
		return {
			success: false,
			message: (error as Error).message || "Failed to fetch plugins",
			plugins: [],
		};
	}
}

// ============================================================================
// POST - Create new plugin
// ============================================================================

type CreatePluginFields = parsedPlugin;
type CreatePluginUserInput = Omit<
	CreatePluginFields,
	| "id"
	| "downloads"
	| "ownerId"
	| "createdAt"
	| "updatedAt"
	| "upvote"
	| "downvote"
	| "version"
>;

export async function POST(data: CreatePluginUserInput): Promise<{
	success: boolean;
	message: string;
	redirect?: string;
	fields?: Array<keyof CreatePluginFields>;
}> {
	const context = getContext<Cloudflare.Env, "", never>(arguments);
	const db = getDb(context.env.DB);
	try {
		// Get authenticated user
		const client = await createClient().setTokenFromRequest(
			context.request as unknown as Request,
		);
		await client.getUserSession("public");
		if (!client.isAuthenticated || !client.userMeta.id) {
			return {
				success: false,
				message: "Unauthorized - Please login",
				redirect: "/login",
			};
		}

		// Check if plugin with same name already exists
		const existing = await db
			.select()
			.from(DBPlugins)
			.where(eq(DBPlugins.name, data.name))
			.get();

		if (existing) {
			return {
				success: false,
				message: "Plugin with this name already exists",
				fields: ["name"],
			};
		}

		await requireActiveGitHubAppLinkForRepo({
			db,
			githubUrl: data.githubUrl || "",
			userId: client.userMeta.id,
		});

		const metadata = await resolvePluginMetadata({
			githubUrl: data.githubUrl || "",
			npmPackage: data.npmPackage || "",
		});

		const now = new Date();

		const {
			id,
			downloads,
			createdAt,
			updatedAt,
			downvote,
			upvote,
			// check for exists
			name,
			description,
			compatibleVersions,
			author,
			category,
			tags,
			...authorizedUserInput
		} = data as CreatePluginFields;

		const parsedData = parsePluginsToDB({
			...authorizedUserInput,
			githubUrl: metadata.githubUrl,
			name: name || "",
			description: description || "",
			version: metadata.latestVersion,
			compatibleVersions: compatibleVersions || "",
			author: author || "",
			category: category || "",
			tags: tags || [],
			npmPackage: metadata.npmPackage,
			ownerId: client.userMeta.id,
			createdAt: now,
			updatedAt: now,
		}) as typeof DBPlugins.$inferInsert;

		// Create plugin
		const createdPlugin = await db
			.insert(DBPlugins)
			.values(parsedData)
			.returning({ id: DBPlugins.id })
			.get();

		if (!createdPlugin) {
			throw new Error("Failed to create plugin record");
		}

		await replacePluginVersionHistory({
			db,
			pluginId: createdPlugin.id,
			versions: metadata.versions,
		});

		return {
			success: true,
			message: "Plugin created successfully",
		};
	} catch (error) {
		console.error("POST plugin error:", error);
		await logError({
			context: context as never,
			error,
			endpoint: "/api/plugins",
			method: "POST",
			severity: "error",
			additionalContext: { pluginName: data.name },
		});
		return {
			success: false,
			message: (error as Error).message || "Failed to create plugin",
		};
	}
}

// ============================================================================
// PUT - Update an existing plugin
// ============================================================================

type UpdatePluginFields = Partial<Omit<parsedPlugin, "id">> & { id: number };

export async function PUT(data: UpdatePluginFields): Promise<{
	success: boolean;
	message?: string;
	data?: parsedPlugin;
	error?: string;
}> {
	const context = getContext<Cloudflare.Env, "", never>(arguments);

	try {
		// Get authenticated user
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(context.request as unknown as Request);
		await client.getUserSession("private");
		if (!client.isAuthenticated || !client.userMeta.id) {
			return {
				success: false,
				error: "Unauthorized - Please login",
			};
		}

		const db = getDb(context.env.DB);

		const whereStatement =
			client.userMeta.role === "admin"
				? eq(DBPlugins.id, data.id)
				: and(
						eq(DBPlugins.id, data.id),
						eq(DBPlugins.ownerId, client.userMeta.id),
					);

		// Check if plugin exists and belongs to user
		const existing = await db
			.select()
			.from(plugins)
			.where(whereStatement)
			.get();

		if (!existing) {
			return {
				success: false,
				error: "Plugin not found",
			};
		}

		await requireActiveGitHubAppLinkForRepo({
			db,
			githubUrl: data.githubUrl || existing.githubUrl || "",
			userId: client.userMeta.id,
		});

		const metadata = await resolvePluginMetadata({
			githubUrl: data.githubUrl || existing.githubUrl || "",
			npmPackage: data.npmPackage || existing.npmPackage,
		});

		const {
			id,
			downloads,
			ownerId,
			createdAt,
			updatedAt,
			upvote,
			downvote,
			version,
			...acceptedFields
		} = data;

		// Build update data
		const updateData: Partial<parsedPlugin> = {
			...acceptedFields,
			githubUrl: metadata.githubUrl,
			npmPackage: metadata.npmPackage,
			version: metadata.latestVersion,
			updatedAt: new Date(),
		};

		// Update plugin
		const updatedPlugin = await db
			.update(plugins)
			.set(parsePluginsToDB(updateData))
			.where(eq(plugins.id, data.id))
			.returning()
			.get();

		if (!updatedPlugin) {
			return {
				success: false,
				error: "Failed to fetch updated plugin",
			};
		}

		await replacePluginVersionHistory({
			db,
			pluginId: updatedPlugin.id,
			versions: metadata.versions,
		});

		return {
			success: true,
			message: "Plugin updated successfully",
			data: parsePlugin(updatedPlugin),
		};
	} catch (error) {
		console.error("PUT plugin error:", error);
		await logError({
			context: context as never,
			error,
			endpoint: "/api/plugins",
			method: "PUT",
			severity: "error",
			additionalContext: { pluginId: data.id },
		});
		return {
			success: false,
			error: (error as Error).message || "Failed to update plugin",
		};
	}
}

// ============================================================================
// DELETE - Delete a plugin
// ============================================================================

export async function DELETE(pluginId: number): Promise<{
	success: boolean;
	message?: string;
	error?: string;
}> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	try {
		const client = await createClient().setTokenFromRequest(
			context.request as unknown as Request,
		);
		await client.getUserSession("public");
		if (!client.isAuthenticated || !client.userMeta.id) {
			return {
				success: false,
				error: "Unauthorized",
			};
		}

		const userData = client.userMeta;

		if (!verifyAccess(client.userMeta.role, ["admin", "moderator", "user"])) {
			return {
				success: false,
				error: "Unauthorized",
			};
		}

		const db = getDb(context.env.DB);

		// Check if plugin exists
		const existing = await db
			.select()
			.from(plugins)
			.where(eq(plugins.id, pluginId))
			.get();

		if (!existing) {
			return {
				success: false,
				error: "Plugin not found",
			};
		}

		if (
			existing.ownerId !== userData.id &&
			!verifyAccess(client.userMeta.role, ["admin", "moderator"])
		) {
			return {
				success: false,
				error: "Unauthorized - You don't own this plugin",
			};
		}

		// Delete plugin
		await db.delete(plugins).where(eq(plugins.id, pluginId)).run();

		return {
			success: true,
			message: "Plugin deleted successfully",
		};
	} catch (error) {
		console.error("DELETE plugin error:", error);
		await logError({
			context: context as never,
			error,
			endpoint: "/api/plugins",
			method: "DELETE",
			severity: "error",
			additionalContext: { pluginId },
		});
		return {
			success: false,
			error: (error as Error).message || "Failed to delete plugin",
		};
	}
}
