"no action";

import { WebHook } from "openauthster-shared/webhook";
import { logError } from "@/action_ext/utils";
import { createClient, type PublicSession } from "@/auth";

export const onRequest: PagesFunction<Env> = async (context) => {
	const request = context.request as unknown as Request;
	return await WebHook.getWebHookPayloadFromRequest(
		"registration_success",
		request,
		context.env.AUTH_SECRET,
	)
		.then(async (wh) => {
			const client = createClient({
				secret: context.env.AUTH_SECRET,
			});
			const userInfo = await client.getUserById(wh.data.userID).then((user) => {
				if (user instanceof Error) {
					throw user;
				} else {
					return user.data.users.at(0);
				}
			});
			if (!userInfo) {
				throw new Error("User not found");
			}

			const session: Partial<PublicSession> = userInfo.session_public || {};
			if (wh.data.provider === "github") {
				session.name = userInfo.data.github?.name;
				session.avatarUrl = userInfo.data.github?.avatar_url;
				session.bio = userInfo.data.github?.bio;
				session.githubUrl = (
					userInfo.data.github as { html_url?: string }
				).html_url;
			}
			if (wh.data.provider !== "qr") {
				await client.updateUserById(wh.data.userID, {
					role: userInfo.role || "user",
					session_public: session,
				});
			}

			return new Response("Webhook received", { status: 200 });
		})
		.catch(async () => {
			await logError({
				context: {
					...context,
				},
				error: new Error("Invalid webhook payload"),
				endpoint: "/api/auth/new_user/webhook",
				method: "POST",
				severity: "warning",
			});
			return new Response("Invalid webhook payload", { status: 400 });
		});
};
