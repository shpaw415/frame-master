"no action";

import { getDb } from "db/index";
import { githubAppLinks, plugins, templates } from "db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/action_ext/utils";
import { resolveTemplateMetadata } from "@/actions/api/templates/metadata";
import {
	normalizeGitHubRepoUrl,
	replacePluginVersionHistory,
	resolvePluginMetadata,
	verifyGitHubWebhookSignature,
} from "./metadata";

type GitHubReleaseWebhookPayload = {
	action?: string;
	installation?: {
		id?: number;
	};
	release?: {
		draft?: boolean;
		tag_name?: string;
	};
	repository?: {
		full_name?: string;
		html_url?: string;
	};
	sender?: {
		login?: string;
	};
};

export const onRequest: PagesFunction<Env> = async (context) => {
	try {
		const webhookSecret = context.env.GITHUB_WEBHOOK_SECRET;
		if (!webhookSecret) {
			return new Response("Missing GITHUB_WEBHOOK_SECRET", { status: 500 });
		}

		const request = context.request as unknown as Request;
		const payloadText = await request.text();
		const signatureHeader = request.headers.get("x-hub-signature-256");
		const isValid = await verifyGitHubWebhookSignature({
			payload: payloadText,
			secret: webhookSecret,
			signatureHeader,
		});

		if (!isValid) {
			await logError({
				context: context as never,
				error: new Error("Invalid GitHub webhook signature"),
				endpoint: "/api/plugins/github-webhook",
				method: "POST",
				severity: "warning",
			});

			return new Response("Invalid signature", { status: 401 });
		}

		const eventType = request.headers.get("x-github-event");
		if (eventType === "ping") {
			return Response.json({ success: true, message: "pong" });
		}

		const payload = JSON.parse(payloadText) as GitHubReleaseWebhookPayload;

		if (eventType === "installation") {
			const installationId = payload.installation?.id;
			if (!installationId) {
				return new Response("Missing installation ID", { status: 400 });
			}

			const state =
				payload.action === "deleted"
					? "deleted"
					: payload.action === "suspend"
						? "suspended"
						: payload.action === "created" || payload.action === "unsuspend"
							? "active"
							: null;

			if (!state) {
				return Response.json({ success: true, skipped: true }, { status: 202 });
			}

			const db = getDb(context.env.DB);
			await db
				.update(githubAppLinks)
				.set({
					installationState: state,
					lastValidatedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(githubAppLinks.installationId, String(installationId)));

			return Response.json({ success: true, installationState: state });
		}

		if (eventType !== "release") {
			return Response.json({ success: true, skipped: true }, { status: 202 });
		}

		if (payload.action !== "published" || payload.release?.draft) {
			return Response.json({ success: true, skipped: true }, { status: 202 });
		}

		const repositoryUrl = payload.repository?.html_url;
		if (!repositoryUrl) {
			return new Response("Missing repository URL", { status: 400 });
		}

		const normalizedGithubUrl = normalizeGitHubRepoUrl(repositoryUrl);
		const db = getDb(context.env.DB);
		const plugin = await db
			.select({
				githubUrl: plugins.githubUrl,
				id: plugins.id,
				npmPackage: plugins.npmPackage,
			})
			.from(plugins)
			.where(eq(plugins.githubUrl, normalizedGithubUrl))
			.get();
		const template = await db
			.select({
				githubRepoUrl: templates.githubRepoUrl,
				id: templates.id,
			})
			.from(templates)
			.where(eq(templates.githubRepoUrl, normalizedGithubUrl))
			.get();

		if (!plugin && !template) {
			return Response.json({ success: true, skipped: true }, { status: 202 });
		}

		let latestPluginVersion: string | null = null;
		let pluginVersionCount = 0;
		let latestTemplateVersion: string | null = null;

		if (plugin) {
			const metadata = await resolvePluginMetadata({
				githubUrl: normalizedGithubUrl,
				npmPackage: plugin.npmPackage,
			});

			await db
				.update(plugins)
				.set({
					version: metadata.latestVersion,
				})
				.where(eq(plugins.id, plugin.id));

			await replacePluginVersionHistory({
				db,
				pluginId: plugin.id,
				versions: metadata.versions,
			});

			latestPluginVersion = metadata.latestVersion;
			pluginVersionCount = metadata.versions.length;
		}

		if (template) {
			const metadata = await resolveTemplateMetadata({
				githubRepoUrl: normalizedGithubUrl,
			});

			await db
				.update(templates)
				.set({
					defaultVersion: metadata.defaultVersion,
					githubReleaseUrl: metadata.githubReleaseUrl,
					githubRepoUrl: metadata.githubRepoUrl,
					updatedAt: new Date(),
				})
				.where(eq(templates.id, template.id));

			latestTemplateVersion = metadata.defaultVersion;
		}

		return Response.json({
			success: true,
			plugin: latestPluginVersion
				? {
						latestVersion: latestPluginVersion,
						versionCount: pluginVersionCount,
					}
				: null,
			template: latestTemplateVersion
				? {
						latestVersion: latestTemplateVersion,
					}
				: null,
		});
	} catch (error) {
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/api/plugins/github-webhook",
			method: "POST",
			severity: "error",
		});

		return new Response("Failed to process webhook", { status: 500 });
	}
};
