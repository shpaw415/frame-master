"no action";
import type { EventContext } from "@cloudflare/workers-types";
import { getDb } from "db/index";
import { plugins as DBPlugins } from "db/schema";
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

type PluginResult = {
	name: string;
	version: string;
	description: string;
	npmPackage: string;
	category: string;
	compatibleVersions: string;
	score?: number;
};

type PluginSearchResult = {
	plugins: PluginResult[];
	total: number;
	page: number;
	pageSize: number;
};

/**
 * Calculate relevance score for a plugin
 */
function calculateRelevance(
	plugin: typeof DBPlugins.$inferSelect,
	parsedQuery: ParsedQuery,
): number {
	let score = 0;

	// Score regular terms with fuzzy matching
	for (const term of parsedQuery.terms) {
		// Name match (highest weight)
		score += fuzzyScore(term, plugin.name) * 100;

		// NPM package match
		score += fuzzyScore(term, plugin.npmPackage) * 80;

		// Description contains
		if (plugin.description.toLowerCase().includes(term)) {
			score += 50;
		}

		// Tags match
		const tags = plugin.tags.map((tag) => tag.toLowerCase());
		if (tags.includes(term)) {
			score += 60;
		}

		// Author match
		score += fuzzyScore(term, plugin.author) * 40;
	}

	// Score exact phrases
	for (const phrase of parsedQuery.exactPhrases) {
		const searchable =
			`${plugin.name} ${plugin.description} ${plugin.tags.join(" ")}`.toLowerCase();
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
	const full = url.searchParams.get("full") === "true"; // Include all fields

	try {
		const db = getDb(ctx.env.DB);
		const whereConditions = [];

		// Only published plugins
		whereConditions.push(eq(DBPlugins.published, true));

		// Exact name match (bypasses fuzzy search)
		if (name) {
			whereConditions.push(eq(DBPlugins.name, name));
		}

		// Category filter
		if (category && category !== "all") {
			whereConditions.push(eq(DBPlugins.category, category));
		}

		// Parse advanced query with plugin-specific fields
		const parsedQuery = parseAdvancedQuery(query, [
			"name",
			"tag",
			"author",
			"npm",
			"category",
		]);

		// Apply field-specific filters
		for (const [field, value] of parsedQuery.fieldFilters) {
			switch (field) {
				case "name":
					whereConditions.push(like(DBPlugins.name, `%${value}%`));
					break;
				case "tag":
					whereConditions.push(like(DBPlugins.tags, `%${value}%`));
					break;
				case "author":
					whereConditions.push(like(DBPlugins.author, `%${value}%`));
					break;
				case "npm":
					whereConditions.push(like(DBPlugins.npmPackage, `%${value}%`));
					break;
				case "category":
					whereConditions.push(eq(DBPlugins.category, value));
					break;
			}
		}

		// Basic SQL filtering for exact phrases (before fuzzy scoring)
		for (const phrase of parsedQuery.exactPhrases) {
			const phraseTerm = `%${phrase}%`;
			whereConditions.push(
				or(
					like(DBPlugins.name, phraseTerm),
					like(DBPlugins.description, phraseTerm),
					like(DBPlugins.tags, phraseTerm),
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
						like(DBPlugins.name, searchTerm),
						like(DBPlugins.description, searchTerm),
						like(DBPlugins.tags, searchTerm),
						like(DBPlugins.npmPackage, searchTerm),
					),
				);
			}
		}

		// Fetch all matching plugins for fuzzy scoring
		const allResults = await db
			.select()
			.from(DBPlugins)
			.where(and(...whereConditions));

		// Apply fuzzy scoring and filtering
		let scoredResults: Array<(typeof allResults)[0] & { score: number }> =
			allResults.map((p) => ({
				...p,
				score: fuzzy ? calculateRelevance(p, parsedQuery) : 0,
			}));

		// Filter out excluded terms
		if (parsedQuery.excludeTerms.length > 0) {
			scoredResults = scoredResults.filter((p) => {
				const searchable = `${p.name} ${p.description} ${p.tags.join(" ")} ${p.npmPackage}`;
				return !shouldExclude(searchable, parsedQuery.excludeTerms);
			});
		}

		// Filter out zero-score results when fuzzy searching with terms
		if (fuzzy && parsedQuery.terms.length > 0) {
			scoredResults = scoredResults.filter((p) => p.score > 0);
		}

		// Sort results
		sortResults(scoredResults, sortBy, sortOrder, fuzzy);

		// Paginate
		const { items: paginatedResults, total } = paginateResults(
			scoredResults,
			page,
			pageSize,
		);

		const response: PluginSearchResult = {
			plugins: paginatedResults.map((p) => {
				if (full) {
					// Return all fields
					const { score, ...rest } = p;
					return {
						...rest,
						tags: p.tags || [],
						dependencies: p.dependencies || [],
						...(fuzzy && { score: Math.round(score) }),
					};
				}
				// Standard response with optional longDescription
				return {
					name: p.name,
					version: p.version,
					description: p.description,
					npmPackage: p.npmPackage,
					category: p.category,
					compatibleVersions: p.compatibleVersions,
					...(includeLongDesc && { longDescription: p.longDescription }),
					...(fuzzy && { score: Math.round(p.score) }),
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
		console.error("CLI plugin search error:", error);
		return new Response(JSON.stringify({ error: "Failed to search plugins" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
