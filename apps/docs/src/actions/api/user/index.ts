import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { deleteUser, logError } from "@/action_ext/utils";
import { createClient } from "@/auth";

///////////////
// DELETE USER ACCOUNT
// Permanently deletes the user account and all associated data
////////////
export async function DELETE(): Promise<{
	success: boolean;
	message?: string;
}> {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);
	const client = await createClient({
		secret: ctx.env.AUTH_SECRET,
	}).setTokenFromRequest(ctx.request as unknown as Request);
	await client.getUserSession("private");

	if (!client.isAuthenticated || !client.userMeta.id) {
		return {
			success: false,
			message: "Unauthorized - No active session",
		};
	}
	const userId = client.userMeta.id;
	try {
		return deleteUser(userId, ctx.env.DB, client);
	} catch (error) {
		await logError({
			context: ctx as never,
			error: error as Error,
			endpoint: "/api/user/delete",
			method: "DELETE",
			severity: "critical",
			additionalContext: { userId },
		});

		return { success: false, message: "Failed to delete account" };
	}
}
