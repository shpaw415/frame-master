import { getDb } from "db/index";
import { parsePlugin } from "db/parse";
import { plugins as DBPlugins, type parsedPlugin } from "db/schema";
import { and, eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { logError } from "@/action_ext/utils";
import { createClient, type PublicSession } from "@/auth";

// ============================================================================
// Public Profile Data (safe to expose)
// ============================================================================

export type PublicUserProfile = {
	id: string;
	name: string;
	bio?: string;
	avatarUrl?: string;
	githubUrl?: string;
	createdAt?: string;
};

// ============================================================================
// GET - Fetch public user profile by ID
// ============================================================================

export async function GET(params: { userId: string }): Promise<{
	success: boolean;
	profile?: PublicUserProfile;
	plugins?: parsedPlugin[];
	message?: string;
}> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	if (!params?.userId) {
		return {
			success: false,
			message: "User ID is required",
		};
	}

	const userdata = await createClient({
		secret: context.env.AUTH_SECRET,
	}).getUserById(params.userId);

	if (userdata instanceof Error) {
		return {
			success: false,
			message: userdata.message || "Failed to fetch user data",
		};
	} else if (!userdata.success) {
		return {
			success: false,
			message: userdata.error || "User not found",
		};
	}
	try {
		const user = userdata.data?.users.at(0);
		if (!user) {
			return {
				success: false,
				message: "User not found",
			};
		}
		const session_public = user.session_public as PublicSession | undefined;
		// Build public profile (only expose safe fields)
		const publicProfile: PublicUserProfile = {
			id: user.id || "",
			name: session_public?.name || "Anonymous",
			bio: session_public?.bio,
			avatarUrl: session_public?.avatarUrl,
			githubUrl: session_public?.githubUrl,
			createdAt: user?.created_at,
		};

		const db = getDb(context.env.DB);
		// Fetch user's published plugins
		const userPlugins = await db
			.select()
			.from(DBPlugins)
			.where(
				and(
					eq(DBPlugins.ownerId, params.userId),
					eq(DBPlugins.published, true),
				),
			);

		return {
			success: true,
			profile: publicProfile,
			plugins: userPlugins.map(parsePlugin),
		};
	} catch (error) {
		console.error("GET profile error:", error);
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/profile",
			method: "GET",
			severity: "error",
			additionalContext: { params },
		});
		return {
			success: false,
			message: (error as Error).message || "Failed to fetch profile",
		};
	}
}
