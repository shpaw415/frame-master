"no action";

import { getDb } from "db/index";
import {
	beginDeviceLogin,
	CLI_AUTH_INTERVAL_SECONDS,
	CLI_AUTH_TTL_MS,
	formatUserCode,
} from "../device";
import { json } from "../http";
import { createDeviceStore } from "../store";

export const onRequestPost: PagesFunction<Env> = async (context) => {
	try {
		const started = await beginDeviceLogin(
			createDeviceStore(getDb(context.env.DB)),
		);
		const origin = new URL(context.request.url).origin;
		return json({
			deviceCode: started.deviceCode,
			expiresIn: CLI_AUTH_TTL_MS / 1000,
			interval: CLI_AUTH_INTERVAL_SECONDS,
			userCode: formatUserCode(started.userCode),
			verificationUrl: `${origin}/cli/login?code=${encodeURIComponent(formatUserCode(started.userCode))}`,
		});
	} catch (error) {
		console.error("CLI auth start error:", error);
		return json({ error: "Failed to start CLI login", success: false }, 500);
	}
};
