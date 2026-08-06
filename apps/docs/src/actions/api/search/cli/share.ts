"no action";

// ============================================================================
// TYPES
// ============================================================================

export type ParsedQuery = {
	terms: string[]; // Regular search terms
	exactPhrases: string[]; // "exact match"
	excludeTerms: string[]; // -excluded
	fieldFilters: Map<string, string>; // field:value
};

// ============================================================================
// ADVANCED SEARCH PARSER
// ============================================================================

/**
 * Parse advanced search query syntax:
 * - "exact phrase" - exact match
 * - -excluded - exclude term
 * - field:value - field-specific search
 * - regular terms - fuzzy match
 */
export function parseAdvancedQuery(
	query: string,
	allowedFields: string[] = ["name", "tag", "author", "category"],
): ParsedQuery {
	const result: ParsedQuery = {
		terms: [],
		exactPhrases: [],
		excludeTerms: [],
		fieldFilters: new Map(),
	};

	if (!query.trim()) return result;

	// Extract exact phrases "..."
	const exactRegex = /"([^"]+)"/g;
	let match: RegExpExecArray | null = exactRegex.exec(query);
	while (match !== null) {
		if (match[1]) {
			result.exactPhrases.push(match[1].toLowerCase());
		}
		match = exactRegex.exec(query);
	}
	query = query.replace(exactRegex, "");

	// Split remaining into tokens
	const tokens = query.split(/\s+/).filter(Boolean);

	// Build regex pattern from allowed fields
	const fieldPattern = new RegExp(`^(${allowedFields.join("|")}):(.+)$`, "i");

	for (const token of tokens) {
		// Exclude terms: -word
		if (token.startsWith("-") && token.length > 1) {
			result.excludeTerms.push(token.slice(1).toLowerCase());
			continue;
		}

		// Field filters: field:value
		const fieldMatch = token.match(fieldPattern);
		if (fieldMatch?.[1] && fieldMatch?.[2]) {
			result.fieldFilters.set(
				fieldMatch[1].toLowerCase(),
				fieldMatch[2].toLowerCase(),
			);
			continue;
		}

		// Regular term
		if (token.length > 0) {
			result.terms.push(token.toLowerCase());
		}
	}

	return result;
}

// ============================================================================
// FUZZY MATCHING UTILITIES
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	// Initialize matrix with proper dimensions
	const matrix: number[][] = Array.from({ length: b.length + 1 }, () =>
		Array(a.length + 1).fill(0),
	);

	// Fill first column
	for (let i = 0; i <= b.length; i++) {
		(matrix[i] as number[])[0] = i;
	}

	// Fill first row
	for (let j = 0; j <= a.length; j++) {
		(matrix[0] as number[])[j] = j;
	}

	// Fill rest of matrix
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			const substitutionCost =
				((matrix[i - 1] as number[])[j - 1] as number) +
				(b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1);
			const insertionCost = ((matrix[i] as number[])[j - 1] as number) + 1;
			const deletionCost = ((matrix[i - 1] as number[])[j] as number) + 1;
			(matrix[i] as number[])[j] = Math.min(
				substitutionCost,
				insertionCost,
				deletionCost,
			);
		}
	}

	return (matrix[b.length] as number[])[a.length] as number;
}

/**
 * Calculate fuzzy similarity score (0-1, higher is better)
 */
export function fuzzyScore(query: string, target: string): number {
	const q = query.toLowerCase();
	const t = target.toLowerCase();

	// Exact match
	if (t === q) return 1;

	// Contains exact query
	if (t.includes(q)) return 0.9;

	// Starts with query
	if (t.startsWith(q)) return 0.85;

	// Word boundary match
	const words = t.split(/[\s\-_]+/);
	for (const word of words) {
		if (word.startsWith(q)) return 0.8;
	}

	// Levenshtein-based similarity
	const maxLen = Math.max(q.length, t.length);
	if (maxLen === 0) return 0;

	const distance = levenshteinDistance(q, t);
	const similarity = 1 - distance / maxLen;

	// Only return if reasonably similar (threshold: 0.4)
	return similarity > 0.4 ? similarity * 0.7 : 0;
}

/**
 * Check if an item should be excluded based on exclude terms
 */
export function shouldExclude(
	searchableText: string,
	excludeTerms: string[],
): boolean {
	const text = searchableText.toLowerCase();
	return excludeTerms.some((term) => text.includes(term));
}

/**
 * Sort results by various criteria
 */
export function sortResults<
	T extends {
		score: number;
		name: string;
		createdAt?: Date | null;
		updatedAt?: Date | null;
	},
>(results: T[], sortBy: string, sortOrder: string, fuzzy: boolean): T[] {
	if (sortBy === "relevance" && fuzzy) {
		results.sort((a, b) =>
			sortOrder === "desc" ? b.score - a.score : a.score - b.score,
		);
	} else {
		results.sort((a, b) => {
			let aVal: string | number;
			let bVal: string | number;

			switch (sortBy) {
				case "created":
					aVal = a.createdAt?.getTime() ?? 0;
					bVal = b.createdAt?.getTime() ?? 0;
					break;
				case "updated":
					aVal = a.updatedAt?.getTime() ?? 0;
					bVal = b.updatedAt?.getTime() ?? 0;
					break;
				default:
					aVal = a.name.toLowerCase();
					bVal = b.name.toLowerCase();
			}

			if (typeof aVal === "string" && typeof bVal === "string") {
				return sortOrder === "desc"
					? bVal.localeCompare(aVal)
					: aVal.localeCompare(bVal);
			}
			const numA = typeof aVal === "number" ? aVal : 0;
			const numB = typeof bVal === "number" ? bVal : 0;
			return sortOrder === "desc" ? numB - numA : numA - numB;
		});
	}

	return results;
}

/**
 * Paginate results
 */
export function paginateResults<T>(
	results: T[],
	page: number,
	pageSize: number,
): { items: T[]; total: number } {
	return {
		items: results.slice(page * pageSize, (page + 1) * pageSize),
		total: results.length,
	};
}

/**
 * Parse common pagination query parameters
 */
export function parsePaginationParams(url: URL): {
	page: number;
	pageSize: number;
	sortBy: string;
	sortOrder: string;
	fuzzy: boolean;
} {
	return {
		page: Math.max(0, Number(url.searchParams.get("page") || 0)),
		pageSize: Math.min(
			100,
			Math.max(1, Number(url.searchParams.get("limit") || 25)),
		),
		sortBy: url.searchParams.get("sort") || "relevance",
		sortOrder: url.searchParams.get("order") || "desc",
		fuzzy: url.searchParams.get("fuzzy") !== "false",
	};
}
