"no action";
import type { EventContext } from "@cloudflare/workers-types";
import { getDb } from "db/index";
import { plugins as DBPlugins } from "db/schema";
import { and, eq } from "drizzle-orm";

export async function onRequestGet(
	ctx: EventContext<Env, "id", never>,
): Promise<Response> {
	const id = ctx.params.id as string;

	if (!id) {
		return new Response(
			JSON.stringify({ error: "Missing required parameter: id" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const pluginId = parseInt(id, 10);
	if (Number.isNaN(pluginId)) {
		return new Response(
			JSON.stringify({ error: "Invalid id: must be a number" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		const db = getDb(ctx.env.DB);

		const result = await db
			.select()
			.from(DBPlugins)
			.where(and(eq(DBPlugins.id, pluginId), eq(DBPlugins.published, true)))
			.limit(1);

		if (result.length === 0) {
			return new Response(JSON.stringify({ error: "Plugin not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ plugin: result[0] }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, max-age=60",
			},
		});
	} catch (error) {
		console.error("CLI plugin fetch error:", error);
		return new Response(JSON.stringify({ error: "Failed to fetch plugin" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
