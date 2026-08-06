// ===========================================================================
// API Action: Get Release Notes

import { getDb } from "db/index";
import { type parsedReleaseNote, releaseNotes } from "db/schema";
import { eq } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { getReleaseNotes } from "@/action_ext/utils";

// ===========================================================================
// GET Release Notes
// ===========================================================================
export async function GET(id?: number) {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);
	return getReleaseNotes({ db: ctx.env.DB, id });
}

// ===========================================================================
// Create Release Note
// ===========================================================================
export async function POST(data: parsedReleaseNote) {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);

	const db = getDb(ctx.env.DB);

	const result = await db
		.insert(releaseNotes)
		.values({
			version: data.version,
			title: data.title,
			content: data.content,
			githubUrl: data.githubUrl,
			releasedAt: new Date(data.releasedAt),
		})
		.returning({ id: releaseNotes.id })
		.get();

	if (!result) {
		return {
			success: false as const,
			message: "Failed to create release note",
			data: null,
		};
	}

	return {
		success: true as const,
		/**
		 * The ID of the newly created release note
		 */
		data: result.id as number,
	};
}

// ===========================================================================
// Update Release Note
// ===========================================================================
export async function PUT(id: number, data: Partial<parsedReleaseNote>) {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);

	const db = getDb(ctx.env.DB);

	const result = await db
		.update(releaseNotes)
		.set({
			version: data.version,
			title: data.title,
			content: data.content,
			githubUrl: data.githubUrl,
			releasedAt: data.releasedAt ? new Date(data.releasedAt) : undefined,
		})
		.where(eq(releaseNotes.id, id))
		.returning({ id: releaseNotes.id })
		.get();

	if (!result) {
		return {
			success: false as const,
			message: "Failed to update release note",
			data: null,
		};
	}

	return {
		success: true as const,
		/**
		 * The ID of the updated release note
		 */
		data: result.id as number,
	};
}

// ===========================================================================
// Delete Release Note
// ===========================================================================
export async function DELETE(id: number) {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);

	const db = getDb(ctx.env.DB);

	const result = await db
		.delete(releaseNotes)
		.where(eq(releaseNotes.id, id))
		.returning({ id: releaseNotes.id })
		.get();

	if (!result) {
		return {
			success: false as const,
			message: "Failed to delete release note",
			data: null,
		};
	}

	return {
		success: true as const,
		/**
		 * The ID of the deleted release note
		 */
		data: result.id as number,
	};
}
