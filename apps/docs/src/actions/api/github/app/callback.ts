"no action";
import { getDb } from "db/index";
import { logError } from "@/action_ext/utils";
import { createClient } from "@/auth";
import {
	buildGitHubAppSettingsRedirect,
	clearGitHubInstallStateCookie,
	createGitHubApp,
	getGitHubInstallStateFromCookie,
	upsertGitHubAppLink,
	verifyGitHubInstallState,
} from "./utils";

export const onRequest: PagesFunction<Env> = async (context) => {
	const request = context.request as unknown as Request;

	try {
		const url = new URL(request.url);
		const state = await verifyGitHubInstallState({
			env: context.env,
			state:
				url.searchParams.get("state") ||
				getGitHubInstallStateFromCookie(request),
		});
		const installationId = url.searchParams.get("installation_id");

		if (!installationId) {
			throw new Error("Missing GitHub installation ID");
		}

		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(request);
		await client.getUserSession("public");

		if (!client.isAuthenticated || client.userMeta.id !== state.userId) {
			throw new Error("GitHub install callback user mismatch");
		}

		const db = getDb(context.env.DB);
		const installationNumber = Number(installationId);

		if (!Number.isInteger(installationNumber) || installationNumber <= 0) {
			throw new Error("Invalid GitHub installation ID");
		}

		const app = createGitHubApp(context.env);
		const installationResponse = await app.octokit.request(
			"GET /app/installations/{installation_id}",
			{
				installation_id: installationNumber,
				headers: {
					"X-GitHub-Api-Version": "2022-11-28",
				},
			},
		);

		await upsertGitHubAppLink({
			db,
			installation: installationResponse.data,
			userId: client.userMeta.id,
		});

		return new Response(null, {
			status: 302,
			headers: {
				Location: buildGitHubAppSettingsRedirect({
					request,
					returnTo: state.returnTo,
					result: "linked",
				}),
				"Set-Cookie": clearGitHubInstallStateCookie(request),
			},
		});
	} catch (error) {
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/github/app/callback",
			method: "GET",
			severity: "error",
		});

		return new Response(null, {
			status: 302,
			headers: {
				Location: buildGitHubAppSettingsRedirect({
					error: error instanceof Error ? error.message : "callback_failed",
					request,
					returnTo: "/settings",
					result: "linked",
				}),
				"Set-Cookie": clearGitHubInstallStateCookie(request),
			},
		});
	}
};
