import { verifyAccess } from "@/action_ext/utils";
import { createClient } from "@/auth";

export async function onRequest(context: EventContext<Env, any, any>) {
	try {
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(context.request as unknown as Request);

		const session = await client.getUserSession("private");

		if (
			session instanceof Error ||
			!verifyAccess(session.userInfo.role, ["admin", "moderator"])
		) {
			return new Response("Unauthorized", { status: 401 });
		}
		context.data.client = client;
		return await context.next();
	} catch (error) {
		const err = error as Error;
		return new Response(`${err.message}\n${err.stack}`, { status: 500 });
	}
}
