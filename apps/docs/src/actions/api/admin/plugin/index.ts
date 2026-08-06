import { getDb } from "db/index";
import { parsePluginsToDB } from "db/parse";
import { type parsedPlugin, plugins } from "db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { logError } from "@/action_ext/utils";

//////////////////
// update a plugin from any user
//////////////////

export async function PATCH(
	pluginData: Partial<parsedPlugin> & { id: string },
): Promise<{
	success: boolean;
	error?: string;
	status?: number;
}> {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);

	try {
		await getDb(ctx.env.DB)
			.update(plugins)
			.set(parsePluginsToDB(pluginData))
			.where(eq(plugins.id, pluginData.id));

		return { success: true };
	} catch (error) {
		console.error("Plugin PATCH error:", error);
		logError({
			context: ctx as never,
			error: error as Error,
			endpoint: "/admin/api/plugin",
			method: "PATCH",
			severity: "error",
			additionalContext: { pluginData },
		});
		return {
			success: false,
			error: "Internal Server Error",
			status: 500,
		};
	}
}

//////////////////
// delete a plugin from any user
//////////////////

export async function DELETE(pluginId: number): Promise<{
	success: boolean;
	error?: string;
	message?: string;
	status?: number;
}> {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);

	try {
		const db = getDb(ctx.env.DB);

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
				status: 404,
			};
		}

		// Delete plugin
		await db.delete(plugins).where(eq(plugins.id, pluginId)).run();

		return {
			success: true,
			message: "Plugin deleted successfully",
		};
	} catch (error) {
		console.error("Admin plugin DELETE error:", error);
		await logError({
			context: ctx as never,
			error: error as Error,
			endpoint: "/admin/api/plugin",
			method: "DELETE",
			severity: "error",
			additionalContext: { pluginId },
		});
		return {
			success: false,
			error: "Failed to delete plugin",
			status: 500,
		};
	}
}
