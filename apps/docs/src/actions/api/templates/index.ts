import { getDb } from "db/index";
import { parseTemplate } from "db/parse";
import { templates as DBTemplates, type parsedTemplate } from "db/schema";
import { and, eq, like, or } from "drizzle-orm";
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { APIError, logError, verifyAccess } from "@/action_ext/utils";
import { createClient } from "@/auth";
import {
	createTemplateListing,
	type CreateTemplateUserInput,
	updateTemplateListing,
} from "./listing";

type TemplateParams = {
	id?: string;
	userId?: string;
	page?: number;
	pageSize?: number;
	searchQuery?: string;
	category?: string;
	tags?: string[];
	published?: boolean;
};

type TemplateResponse = {
	templates: parsedTemplate[];
	success: boolean;
	message?: string;
};

export async function getTemplates(
	params: TemplateParams & { db: D1Database },
): Promise<TemplateResponse | APIError<TemplateResponse>> {
	const db = getDb(params.db);

	try {
		if (params?.id) {
			// Fetch specific template
			const template = await db
				.select()
				.from(DBTemplates)
				.where(eq(DBTemplates.id, Number(params.id)))
				.get();

			if (!template) {
				return {
					templates: [],
					success: false,
					message: "Template not found",
				};
			}

			return {
				success: true,
				templates: [parseTemplate(template)],
			};
		} else if (params?.userId) {
			// Fetch all templates for a user
			const templates = await db
				.select()
				.from(DBTemplates)
				.where(eq(DBTemplates.ownerId, params.userId));

			return {
				success: true,
				templates: templates.map((t) => parseTemplate(t)),
			};
		} else {
			// Build WHERE conditions for filtering
			const whereConditions = [];

			// Only show published templates by default
			if (params?.published !== false) {
				whereConditions.push(eq(DBTemplates.published, true));
			}

			// Category filter
			if (params?.category && params.category !== "all") {
				whereConditions.push(eq(DBTemplates.category, params.category));
			}

			// Search query filter (name, description, or tags)
			if (params?.searchQuery) {
				const searchTerm = `%${params.searchQuery.toLowerCase()}%`;
				whereConditions.push(
					or(
						like(DBTemplates.name, searchTerm),
						like(DBTemplates.description, searchTerm),
						like(DBTemplates.tags, searchTerm),
					),
				);
			}

			// Pagination
			const page = params?.page ?? 0;
			const pageSize = params?.pageSize ?? 25;

			// Fetch templates with filters
			const templates = await db
				.select()
				.from(DBTemplates)
				.where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
				.limit(pageSize)
				.offset(page * pageSize);

			// Filter by tags if provided (post-query since tags are JSON)
			let filteredTemplates = templates.map((t) => parseTemplate(t));
			if (params?.tags && params.tags.length > 0) {
				filteredTemplates = filteredTemplates.filter((template) =>
					params.tags?.some((tag) => template.tags.includes(tag)),
				);
			}

			return {
				success: true,
				templates: filteredTemplates,
			};
		}
	} catch (error) {
		return new APIError(
			"Failed to fetch templates",
			{
				severity: "error",
				additionalContext: { params },
				error,
			},
			{
				templates: [],
				success: false,
				message: "Failed to fetch templates",
			},
		);
	}
}

// ============================================================================
// GET - Fetch all templates or specific template
// ============================================================================
export async function GET(params?: TemplateParams): Promise<TemplateResponse> {
	const context = getContext<Cloudflare.Env, "", never>(arguments);
	const db = getDb(context.env.DB);

	try {
		if (params?.id) {
			// Fetch specific template
			const template = await db
				.select()
				.from(DBTemplates)
				.where(eq(DBTemplates.id, Number(params.id)))
				.get();

			if (!template) {
				return {
					templates: [],
					success: false,
					message: "Template not found",
				};
			}

			return {
				success: true,
				templates: [parseTemplate(template)],
			};
		} else if (params?.userId) {
			// Fetch all templates for a user
			const templates = await db
				.select()
				.from(DBTemplates)
				.where(eq(DBTemplates.ownerId, params.userId));

			return {
				success: true,
				templates: templates.map((t) => parseTemplate(t)),
			};
		} else {
			// Build WHERE conditions for filtering
			const whereConditions = [];

			// Only show published templates by default
			if (params?.published !== false) {
				whereConditions.push(eq(DBTemplates.published, true));
			}

			// Category filter
			if (params?.category && params.category !== "all") {
				whereConditions.push(eq(DBTemplates.category, params.category));
			}

			// Search query filter (name, description, or tags)
			if (params?.searchQuery) {
				const searchTerm = `%${params.searchQuery.toLowerCase()}%`;
				whereConditions.push(
					or(
						like(DBTemplates.name, searchTerm),
						like(DBTemplates.description, searchTerm),
						like(DBTemplates.tags, searchTerm),
					),
				);
			}

			// Pagination
			const page = params?.page ?? 0;
			const pageSize = params?.pageSize ?? 25;

			// Fetch templates with filters
			const templates = await db
				.select()
				.from(DBTemplates)
				.where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
				.limit(pageSize)
				.offset(page * pageSize);

			// Filter by tags if provided (post-query since tags are JSON)
			let filteredTemplates = templates.map((t) => parseTemplate(t));
			if (params?.tags && params.tags.length > 0) {
				filteredTemplates = filteredTemplates.filter((template) =>
					params.tags?.some((tag) => template.tags.includes(tag)),
				);
			}

			return {
				success: true,
				templates: filteredTemplates,
			};
		}
	} catch (error: any) {
		console.error("GET template error:", error);
		await logError({
			context: context as any,
			error,
			endpoint: "/api/templates",
			method: "GET",
			severity: "error",
			additionalContext: { params },
		});
		return {
			templates: [],
			success: false,
			message: "Failed to fetch templates",
		};
	}
}

// ============================================================================
// POST - Create a new template
// ============================================================================
export async function POST(data: CreateTemplateUserInput): Promise<{
	success: boolean;
	message: string;
	redirect?: string;
	fields?: Array<keyof parsedTemplate>;
}> {
	const context = getContext<Cloudflare.Env, "", never>(arguments);
	const db = getDb(context.env.DB);

	try {
		const session = await createClient().setTokenFromRequest(
			context.request as unknown as Request,
		);
		await session.getUserSession("public");
		if (!session.isAuthenticated || !session.userMeta.id) {
			return {
				success: false,
				message: "Unauthorized - Please login",
				redirect: "/login",
			};
		}

		return await createTemplateListing({
			data,
			db,
			userId: session.userMeta.id,
		});
	} catch (error: any) {
		console.error("POST template error:", error);
		await logError({
			context: context as any,
			error,
			endpoint: "/api/templates",
			method: "POST",
			severity: "error",
			additionalContext: { templateName: data.name },
		});
		return {
			success: false,
			message: error.message || "Failed to create template",
		};
	}
}

// ============================================================================
// PUT - Update an existing template
// ============================================================================
type UpdateTemplateFields = Partial<Omit<parsedTemplate, "id">> & {
	id: number;
};

export async function PUT(data: UpdateTemplateFields): Promise<{
	success: boolean;
	message?: string;
	data?: parsedTemplate;
	error?: string;
}> {
	const context = getContext<Cloudflare.Env, "", never>(arguments);

	try {
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(context.request as unknown as Request);
		await client.getUserSession("private");
		if (!client.isAuthenticated || !client.userMeta.id) {
			return {
				success: false,
				error: "Unauthorized - Please login",
			};
		}

		const db = getDb(context.env.DB);
		return await updateTemplateListing({
			data,
			db,
			role: client.userMeta.role,
			userId: client.userMeta.id,
		});
	} catch (error: any) {
		console.error("PUT template error:", error);
		await logError({
			context: context as any,
			error,
			endpoint: "/api/templates",
			method: "PUT",
			severity: "error",
			additionalContext: { templateId: data.id },
		});
		return {
			success: false,
			error: error.message || "Failed to update template",
		};
	}
}

// ============================================================================
// DELETE - Delete a template
// ============================================================================
export async function DELETE(templateId: number): Promise<{
	success: boolean;
	message?: string;
	error?: string;
}> {
	const context = getContext<Cloudflare.Env, never, never>(arguments);

	try {
		const client = await createClient({
			secret: context.env.AUTH_SECRET,
		}).setTokenFromRequest(context.request as unknown as Request);
		await client.getUserSession("private");
		if (!client.isAuthenticated || !client.userMeta.id) {
			return {
				success: false,
				error: "Unauthorized - Please login",
			};
		}

		const db = getDb(context.env.DB);

		// Check if template exists
		const existing = await db
			.select()
			.from(DBTemplates)
			.where(eq(DBTemplates.id, templateId))
			.get();

		if (!existing) {
			return {
				success: false,
				error: "Template not found",
			};
		}

		if (
			existing.ownerId !== client.userMeta.id &&
			!verifyAccess(client.userMeta.role, ["admin", "moderator"])
		) {
			return {
				success: false,
				error: "Unauthorized - You don't own this template",
			};
		}

		// Delete template
		await db.delete(DBTemplates).where(eq(DBTemplates.id, templateId)).run();

		return {
			success: true,
			message: "Template deleted successfully",
		};
	} catch (error: any) {
		console.error("DELETE template error:", error);
		await logError({
			context: context as any,
			error,
			endpoint: "/api/templates",
			method: "DELETE",
			severity: "error",
			additionalContext: { templateId },
		});
		return {
			success: false,
			error: error.message || "Failed to delete template",
		};
	}
}
