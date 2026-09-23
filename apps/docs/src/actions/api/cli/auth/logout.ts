"no action";

import { getDb } from "db/index";
import { sha256Hex } from "../device";
import { json, readBearer } from "../http";
import { revokeCliToken } from "../store";

export const onRequestPost: PagesFunction<Env> = async (context) => {
	const token = readBearer(context.request as unknown as Request);
	if (!token) return json({ success: true });

	await revokeCliToken({
		db: getDb(context.env.DB),
		tokenHash: await sha256Hex(token),
	});
	return json({ success: true });
};
