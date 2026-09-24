"server only";

import { createClient } from "@/auth";
import { ListingError } from "./access";

export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json",
		},
		status,
	});
}

export function readBearer(request: Request): string | null {
	const header = request.headers.get("authorization") || "";
	const match = /^Bearer\s+(\S+)$/i.exec(header);
	return match?.[1] ?? null;
}

export async function readJson(request: Request): Promise<unknown> {
	const text = await request.text();
	if (!text) return {};
	return JSON.parse(text) as unknown;
}

export function listingErrorResponse(error: unknown): Response | null {
	if (!(error instanceof ListingError)) return null;
	return json(
		{
			code: error.code,
			error: error.message,
			installPath: error.installPath,
			success: false,
		},
		error.status,
	);
}

export function cliAuthGone(): Response {
	return json(
		{
			error:
				"Device-code login was removed. Upgrade frame-master and run frame-master login.",
			success: false,
		},
		410,
	);
}

export async function requireCliUser(context: {
	env: { AUTH_SECRET: string };
	request: Request;
}): Promise<{ userId: string } | Response> {
	if (!readBearer(context.request)) {
		return json({ error: "Unauthorized", success: false }, 401);
	}

	try {
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(context.request);
		await client.getUserSession("public");
		if (!client.isAuthenticated || !client.userMeta?.id) {
			return json({ error: "Unauthorized", success: false }, 401);
		}
		return { userId: client.userMeta.id };
	} catch (error) {
		console.error("CLI auth error:", error);
		return json({ error: "Unauthorized", success: false }, 401);
	}
}
