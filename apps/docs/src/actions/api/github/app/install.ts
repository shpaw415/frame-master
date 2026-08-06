"no action";

import { createClient } from "@/auth";
import {
	buildGitHubAppInstallUrl,
	buildGitHubAppSettingsRedirect,
	createGitHubInstallState,
	createGitHubInstallStateCookie,
} from "./utils";

export const onRequest: PagesFunction<Env> = async (context) => {
	const request = context.request as unknown as Request;

	const token = (await request.formData()).get("token") as string | undefined;

	const client = createClient({
		token,
	});
	const meta = await client.getMetaData();

	if (!meta) {
		return Response.redirect(
			buildGitHubAppSettingsRedirect({
				request,
				returnTo: "/settings",
				result: "linked",
				error: "unauthorized",
			}),
			302,
		);
	}

	const returnTo = new URL(request.url).searchParams.get("returnTo");
	const state = await createGitHubInstallState({
		env: context.env,
		returnTo,
		userId: meta.id as string,
	});

	const installUrl = buildGitHubAppInstallUrl({
		env: context.env,
		state,
	});

	return new Response(null, {
		status: 302,
		headers: {
			Location: installUrl,
			"Set-Cookie": createGitHubInstallStateCookie({
				request,
				state,
			}),
		},
	});
};
