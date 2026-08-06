import { getDb } from "db/index";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { logError } from "@/action_ext/utils";
import { createClient } from "@/auth";
import {
	buildGitHubAppInstallPath,
	getGitHubAppLinkByUserId,
	unlinkGitHubAppLink,
} from "./utils";

export async function GET(): Promise<{
	connected: boolean;
	installPath: string;
	isAuthenticated: boolean;
	link: null | {
		githubAvatarUrl: string | null;
		githubLogin: string;
		installationId: string;
		installationState: "active" | "deleted" | "suspended";
		installedAt: Date;
		lastValidatedAt: Date | null;
	};
	success: boolean;
}> {
	const context = getContext<Env, never, never>(arguments);

	try {
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(context.request as unknown as Request);
		await client.getUserSession("public");

		if (!client.isAuthenticated || !client.userMeta.id) {
			return {
				connected: false,
				installPath: buildGitHubAppInstallPath(),
				isAuthenticated: false,
				link: null,
				success: true,
			};
		}

		const db = getDb(context.env.DB);
		const link = await getGitHubAppLinkByUserId({
			db,
			userId: client.userMeta.id,
		});

		return {
			connected: !!link && link.installationState === "active",
			installPath: buildGitHubAppInstallPath(),
			isAuthenticated: true,
			link: link
				? {
						githubAvatarUrl: link.githubAvatarUrl,
						githubLogin: link.githubLogin,
						installationId: link.installationId,
						installationState: link.installationState,
						installedAt: link.installedAt,
						lastValidatedAt: link.lastValidatedAt,
					}
				: null,
			success: true,
		};
	} catch (error) {
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/github/app",
			method: "GET",
			severity: "error",
		});

		return {
			connected: false,
			installPath: buildGitHubAppInstallPath(),
			isAuthenticated: false,
			link: null,
			success: false,
		};
	}
}

export async function DELETE(): Promise<{
	message?: string;
	success: boolean;
}> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	try {
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(context.request as unknown as Request);
		await client.getUserSession("public");

		if (!client.isAuthenticated || !client.userMeta.id) {
			return {
				message: "Unauthorized",
				success: false,
			};
		}

		const db = getDb(context.env.DB);
		await unlinkGitHubAppLink({
			db,
			userId: client.userMeta.id,
		});

		return {
			message: "GitHub App link removed",
			success: true,
		};
	} catch (error) {
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/github/app",
			method: "DELETE",
			severity: "error",
		});

		return {
			message:
				error instanceof Error ? error.message : "Failed to unlink GitHub App",
			success: false,
		};
	}
}
