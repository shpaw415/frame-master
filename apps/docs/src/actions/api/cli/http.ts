"server only";

import { getDb } from "db/index";
import { ListingError } from "./access";
import { sha256Hex } from "./device";
import { findActiveCliToken, touchCliToken } from "./store";

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

export async function requireCliUser(context: {
	env: { DB: D1Database };
	request: Request;
}): Promise<{ tokenHash: string; userId: string } | Response> {
	const token = readBearer(context.request);
	if (!token?.startsWith("fm_cli_")) {
		return json({ error: "Unauthorized", success: false }, 401);
	}

	const db = getDb(context.env.DB);
	const tokenHash = await sha256Hex(token);
	const row = await findActiveCliToken({ db, tokenHash });
	if (!row) return json({ error: "Unauthorized", success: false }, 401);

	await touchCliToken({ db, tokenHash });
	return { tokenHash, userId: row.userId };
}
