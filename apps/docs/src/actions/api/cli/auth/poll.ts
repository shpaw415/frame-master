"no action";

import { getDb } from "db/index";
import { pollDeviceLogin, randomHex, sha256Hex } from "../device";
import { json, readJson } from "../http";
import { createDeviceStore, insertCliToken } from "../store";

export const onRequestPost: PagesFunction<Env> = async (context) => {
	try {
		const body = (await readJson(context.request as unknown as Request)) as {
			deviceCode?: string;
		};
		if (!body.deviceCode) {
			return json({ error: "Missing device code", success: false }, 400);
		}

		const db = getDb(context.env.DB);
		const result = await pollDeviceLogin(
			createDeviceStore(db),
			body.deviceCode,
		);
		if (result.status === "pending") return json({ status: "pending" });
		if (result.status !== "approved") {
			return json({ error: "CLI login code expired", status: result.status }, 410);
		}

		const token = `fm_cli_${randomHex(32)}`;
		await insertCliToken({
			db,
			tokenHash: await sha256Hex(token),
			userId: result.userId,
		});
		return json({ status: "approved", token });
	} catch (error) {
		console.error("CLI auth poll error:", error);
		return json({ error: "Failed to poll CLI login", success: false }, 500);
	}
};
