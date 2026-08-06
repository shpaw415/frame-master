"no action";
import type { EventContext } from "@cloudflare/workers-types";
import { getDb } from "db/index";
import { templates as DBTemplates } from "db/schema";
import { and, eq, like, or } from "drizzle-orm";
import {
	fuzzyScore,
	type ParsedQuery,
	paginateResults,
	parseAdvancedQuery,
	parsePaginationParams,
	shouldExclude,
	sortResults,
} from "./share";

// ============================================================================
// TYPES
// ============================================================================

type TemplateResult = {
	name: string;
	icon: string;
	description: string;
	author: string;
	category: string;
	githubRepoUrl: string;
	githubReleaseUrl: string;
	defaultVersion: string;
	score?: number;
};

type TemplateSearchResult = {
	templates: TemplateResult[];
	total: number;
	page: number;
	pageSize: number;
};

// ============================================================================
// RELEVANCE SCORING
// ============================================================================

/**
 * Calculate relevance score for a template
 */
function calculateRelevance(
	template: typeof DBTemplates.$inferSelect,
	parsedQuery: ParsedQuery,
): number {
	let score = 0;

	// Score regular terms with fuzzy matching
	for (const term of parsedQuery.terms) {
		// Name match (highest weight)
		score += fuzzyScore(term, template.name) * 100;

		// Author match
		score += fuzzyScore(term, template.author) * 60;

		// Category match
		score += fuzzyScore(term, template.category) * 50;

		// Description contains
		if (template.description.toLowerCase().includes(term)) {
			score += 40;
		}

		// Tags match
		const tags = template.tags.map((tag) => tag.toLowerCase());
		if (tags.includes(term)) {
			score += 60;
		}
	}

	// Score exact phrases
	for (const phrase of parsedQuery.exactPhrases) {
		const searchable =
			`${template.name} ${template.description} ${template.tags.join(" ")}`.toLowerCase();
		if (searchable.includes(phrase)) {
			score += 150;
		}
	}

	return score;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function onRequestGet(
	ctx: EventContext<Env, any, any>,
): Promise<Response> {
	const url = new URL(ctx.request.url);

	// Parse query parameters
	const query = url.searchParams.get("q") || "";
	const category = url.searchParams.get("category") || "";
	const name = url.searchParams.get("name") || "";
	const { page, pageSize, sortBy, sortOrder, fuzzy } =
		parsePaginationParams(url);
	const includeLongDesc = url.searchParams.get("include") === "longDescription";
	const full = url.searchParams.get("full") === "true";

	try {
		const db = getDb(ctx.env.DB);
		const whereConditions = [];

		// Only published templates
		whereConditions.push(eq(DBTemplates.published, true));

		// Exact name match (bypasses fuzzy search)
		if (name) {
			whereConditions.push(eq(DBTemplates.name, name));
		}

		// Category filter
		if (category && category !== "all") {
			whereConditions.push(eq(DBTemplates.category, category));
		}

		// Parse advanced query with template-specific fields
		const parsedQuery = parseAdvancedQuery(query, [
			"name",
			"tag",
			"author",
			"category",
		]);

		// Apply field-specific filters
		for (const [field, value] of parsedQuery.fieldFilters) {
			switch (field) {
				case "name":
					whereConditions.push(like(DBTemplates.name, `%${value}%`));
					break;
				case "tag":
					whereConditions.push(like(DBTemplates.tags, `%${value}%`));
					break;
				case "author":
					whereConditions.push(like(DBTemplates.author, `%${value}%`));
					break;
				case "category":
					whereConditions.push(eq(DBTemplates.category, value));
					break;
			}
		}

		// Basic SQL filtering for exact phrases (before fuzzy scoring)
		for (const phrase of parsedQuery.exactPhrases) {
			const phraseTerm = `%${phrase}%`;
			whereConditions.push(
				or(
					like(DBTemplates.name, phraseTerm),
					like(DBTemplates.description, phraseTerm),
					like(DBTemplates.tags, phraseTerm),
				),
			);
		}

		// SQL-level term filtering (broad match, refined by fuzzy scoring)
		if (parsedQuery.terms.length > 0 && !fuzzy) {
			// Non-fuzzy: strict LIKE matching
			for (const term of parsedQuery.terms) {
				const searchTerm = `%${term}%`;
				whereConditions.push(
					or(
						like(DBTemplates.name, searchTerm),
						like(DBTemplates.description, searchTerm),
						like(DBTemplates.tags, searchTerm),
						like(DBTemplates.author, searchTerm),
					),
				);
			}
		}

		// Fetch all matching templates for fuzzy scoring
		const allResults = await db
			.select()
			.from(DBTemplates)
			.where(and(...whereConditions));

		// Apply fuzzy scoring and filtering
		let scoredResults = allResults.map((t) => ({
			...t,
			score: fuzzy ? calculateRelevance(t, parsedQuery) : 0,
		}));

		// Filter out excluded terms
		if (parsedQuery.excludeTerms.length > 0) {
			scoredResults = scoredResults.filter((t) => {
				const searchable = `${t.name} ${t.description} ${t.tags} ${t.author}`;
				return !shouldExclude(searchable, parsedQuery.excludeTerms);
			});
		}

		// Filter out zero-score results when fuzzy searching with terms
		if (fuzzy && parsedQuery.terms.length > 0) {
			scoredResults = scoredResults.filter((t) => t.score > 0);
		}

		// Sort results
		sortResults(scoredResults, sortBy, sortOrder, fuzzy);

		// Paginate
		const { items: paginatedResults, total } = paginateResults(
			scoredResults,
			page,
			pageSize,
		);

		const response: TemplateSearchResult = {
			templates: paginatedResults.map((t) => {
				if (full) {
					// Return all fields
					const { score, ...rest } = t;
					return {
						...rest,
						tags: t.tags || [],
						features: t.features || null,
						includedPlugins: t.includedPlugins || [],
						...(fuzzy && { score: Math.round(score) }),
					};
				}
				// Standard response with optional longDescription
				return {
					name: t.name,
					icon: t.icon,
					description: t.description,
					author: t.author,
					category: t.category,
					githubRepoUrl: t.githubRepoUrl,
					githubReleaseUrl: t.githubReleaseUrl,
					defaultVersion: t.defaultVersion,
					...(includeLongDesc && { longDescription: t.longDescription }),
					...(fuzzy && { score: Math.round(t.score) }),
				};
			}),
			total,
			page,
			pageSize,
		};

		return new Response(JSON.stringify(response), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, max-age=60",
			},
		});
	} catch (error) {
		console.error("CLI template search error:", error);
		return new Response(
			JSON.stringify({ error: "Failed to search templates" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}
