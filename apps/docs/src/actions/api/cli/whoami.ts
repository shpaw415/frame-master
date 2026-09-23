"no action";

import { getDb } from "db/index";
import { getGitHubAppLinkByUserId } from "@/actions/api/github/app/utils";
import { json, requireCliUser } from "./http";

export const onRequestGet: PagesFunction<Env> = async (context) => {
	const request = context.request as unknown as Request;
	const auth = await requireCliUser({ env: context.env, request });
	if (auth instanceof Response) return auth;

	const db = getDb(context.env.DB);
	const link = await getGitHubAppLinkByUserId({ db, userId: auth.userId });
	const origin = new URL(request.url).origin;

	return json({
		github: {
			connected: !!link && link.installationState === "active",
			installUrl: `${origin}/settings`,
			login: link?.githubLogin ?? null,
			state: link?.installationState ?? null,
		},
		success: true,
		userId: auth.userId,
	});
};
