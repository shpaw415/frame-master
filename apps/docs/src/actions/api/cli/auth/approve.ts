"no action";

import { getDb } from "db/index";
import { createClient } from "@/auth";
import { approveDeviceLogin } from "../device";
import { json, readJson } from "../http";
import { createDeviceStore } from "../store";

export const onRequestPost: PagesFunction<Env> = async (context) => {
	try {
		const request = context.request as unknown as Request;
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(request);
		await client.getUserSession("public");
		if (!client.isAuthenticated || !client.userMeta.id) {
			return json({ error: "Unauthorized - Please login", success: false }, 401);
		}

		const body = (await readJson(request)) as { userCode?: string };
		if (!body.userCode) {
			return json({ error: "Missing login code", success: false }, 400);
		}

		const result = await approveDeviceLogin(
			createDeviceStore(getDb(context.env.DB)),
			body.userCode,
			client.userMeta.id,
		);
		if (!result.ok) return json({ error: result.error, success: false }, result.status);
		return json({ success: true });
	} catch (error) {
		console.error("CLI auth approve error:", error);
		return json({ error: "Failed to approve CLI login", success: false }, 500);
	}
};
