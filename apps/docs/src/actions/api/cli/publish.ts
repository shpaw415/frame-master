"no action";

import { getDb } from "db/index";
import type { CreatePluginUserInput } from "@/actions/api/plugins/listing";
import { upsertPluginListing } from "@/actions/api/plugins/listing";
import type { CreateTemplateUserInput } from "@/actions/api/templates/listing";
import { upsertTemplateListing } from "@/actions/api/templates/listing";
import { json, listingErrorResponse, readJson, requireCliUser } from "./http";

type PublishBody = {
	kind?: "plugin" | "template";
	listing?: CreatePluginUserInput | CreateTemplateUserInput;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
	const request = context.request as unknown as Request;
	const auth = await requireCliUser({ env: context.env, request });
	if (auth instanceof Response) return auth;

	try {
		const body = (await readJson(request)) as PublishBody;
		const db = getDb(context.env.DB);
		const origin = new URL(request.url).origin;

		if (body.kind === "plugin") {
			const saved = await upsertPluginListing({
				data: body.listing as CreatePluginUserInput,
				db,
				userId: auth.userId,
			});
			return json({
				created: saved.created,
				id: saved.plugin.id,
				kind: "plugin",
				name: saved.plugin.name,
				published: saved.plugin.published,
				success: true,
				url: `${origin}/plugins/package/${saved.plugin.id}`,
				version: saved.plugin.version,
			});
		}

		if (body.kind === "template") {
			const saved = await upsertTemplateListing({
				data: body.listing as CreateTemplateUserInput,
				db,
				userId: auth.userId,
			});
			return json({
				created: saved.created,
				id: saved.template.id,
				kind: "template",
				name: saved.template.name,
				published: saved.template.published,
				success: true,
				url: `${origin}/templates/package/${saved.template.id}`,
				version: saved.template.defaultVersion,
			});
		}

		return json({ error: "kind must be plugin or template", success: false }, 400);
	} catch (error) {
		const listed = listingErrorResponse(error);
		if (listed) return listed;
		console.error("CLI publish error:", error);
		return json(
			{
				error: (error as Error).message || "Failed to publish",
				success: false,
			},
			500,
		);
	}
};
