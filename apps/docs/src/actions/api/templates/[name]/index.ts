import type { EventContext } from "@cloudflare/workers-types";
import { getDb } from "db/index";
import { templates } from "db/schema";
import { eq } from "drizzle-orm";

export async function onRequestGet(
	ctx: EventContext<globalThis.Cloudflare.Env, never, never>,
) {
	const db = getDb(ctx.env.DB);
	const params = ctx.params as { name: string; version: string }; // version can be 'latest' or specific version
	const res = await db
		.select()
		.from(templates)
		.where(eq(templates.name, params.name))
		.get();

	if (!res) {
		return new Response("Template not found", { status: 404 });
	}

	if (params.version === "latest") {
		return new Response(res.githubRepoUrl);
	}

	return new Response(JSON.stringify(res), {
		headers: { "Content-Type": "application/json" },
	});
}
