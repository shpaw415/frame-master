import { getDb } from "db/index";
import { parsePlugin, parseTemplate } from "db/parse";
import {
	plugins as DBPlugins,
	templates as DBTemplates,
	type parsedPlugin,
	type parsedTemplate,
} from "db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { logError } from "@/action_ext/utils";
import { createClient } from "@/auth";

// ============================================================================
// TYPES
// ============================================================================

type DashboardStats = {
	totalDownloads: number;
	weeklyDownloads: number;
	monthlyDownloads: number;
	totalPlugins: number;
	publishedPlugins: number;
	draftPlugins: number;
	totalTemplates: number;
	publishedTemplates: number;
	draftTemplates: number;
};

// ============================================================================
// GET - Fetch dashboard data for the authenticated user
// ============================================================================

export async function GET(): Promise<
	| {
			success: true;
			data: {
				stats: DashboardStats;
				plugins: parsedPlugin[];
				templates: parsedTemplate[];
			};
			error?: undefined;
	  }
	| {
			success: false;
			data?: undefined;
			error: string;
	  }
> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	const auth = await createClient({
		secret: context.env.AUTH_SECRET,
	}).setTokenFromRequest(context.request as unknown as Request);

	const db = getDb(context.env.DB);
	const retrivedData: Record<string, unknown> = {
		accessOrder: ["plugins", "templates"],
	};
	try {
		// Get authenticated user
		const err = await auth.getUserSession("private");
		if (err instanceof Error) throw err;
		else if (!auth.userMeta.id) {
			throw new Error("User has no ID");
		}

		// Fetch all plugins for the user
		const plugins = await db
			.select()
			.from(DBPlugins)
			.where(eq(DBPlugins.ownerId, auth.userMeta.id));

		retrivedData.plugins = plugins.map((p) => p.id);

		// Fetch all templates for the user
		const templates = await db
			.select()
			.from(DBTemplates)
			.where(eq(DBTemplates.ownerId, auth.userMeta.id));

		retrivedData.templates = templates.map((t) => t.id);

		const publishedPlugins = plugins.filter((p) => p.published);
		const draftPlugins = plugins.filter((p) => !p.published);
		const publishedTemplates = templates.filter((t) => t.published);
		const draftTemplates = templates.filter((t) => !t.published);

		const stats: DashboardStats = {
			totalDownloads: plugins.reduce(
				(total, plugin) => total + (plugin.downloads || 0),
				0,
			),
			weeklyDownloads: 0,
			monthlyDownloads: 0,
			totalPlugins: plugins.length,
			publishedPlugins: publishedPlugins.length,
			draftPlugins: draftPlugins.length,
			totalTemplates: templates.length,
			publishedTemplates: publishedTemplates.length,
			draftTemplates: draftTemplates.length,
		};

		// Format plugins and templates for response
		const formattedPlugins: parsedPlugin[] = plugins.map(parsePlugin);
		const formattedTemplates: parsedTemplate[] = templates.map(parseTemplate);

		return {
			success: true as const,
			data: {
				stats,
				plugins: formattedPlugins,
				templates: formattedTemplates,
			},
		};
	} catch (error) {
		console.error("Dashboard GET error:", error);
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/dashboard",
			method: "GET",
			severity: "error",
			additionalContext: retrivedData,
		});
		return {
			success: false,
			error: (error as Error).message || "Failed to fetch dashboard data",
		};
	}
}
