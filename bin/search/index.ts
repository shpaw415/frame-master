import { Command } from "commander";
import chalk from "chalk";
import { BASE_URL } from "../share";

const BASE_API_URL = BASE_URL + "/api/search/cli";
const API_URL_SEARCH_PLUGINS = BASE_API_URL + "/plugins";
const API_URL_SEARCH_TEMPLATES = BASE_API_URL + "/templates";

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

// ============================================================================
// QUERY BUILDER
// ============================================================================

type SortField = "relevance" | "name" | "created" | "updated";
type SortOrder = "asc" | "desc";

class PluginSearchQueryBuilder {
  private params: URLSearchParams;

  constructor() {
    this.params = new URLSearchParams();
  }

  /**
   * Set the search query with advanced syntax support:
   * - "exact phrase" - exact match
   * - -excluded - exclude term
   * - field:value - field-specific search (name:, tag:, author:, npm:, category:)
   * - regular terms - fuzzy match
   */
  query(q: string): this {
    if (q) this.params.set("q", q);
    return this;
  }

  /**
   * Filter by category
   */
  category(category: string): this {
    if (category) this.params.set("category", category);
    return this;
  }

  /**
   * Filter by exact plugin name
   */
  name(name: string): this {
    if (name) this.params.set("name", name);
    return this;
  }

  /**
   * Set page number (0-indexed)
   */
  page(page: number): this {
    this.params.set("page", String(Math.max(0, page)));
    return this;
  }

  /**
   * Set results per page (1-100)
   */
  limit(limit: number): this {
    this.params.set("limit", String(Math.min(100, Math.max(1, limit))));
    return this;
  }

  /**
   * Set sort field
   */
  sortBy(field: SortField): this {
    this.params.set("sort", field);
    return this;
  }

  /**
   * Set sort order
   */
  order(order: SortOrder): this {
    this.params.set("order", order);
    return this;
  }

  /**
   * Enable or disable fuzzy matching (enabled by default)
   */
  fuzzy(enabled: boolean): this {
    this.params.set("fuzzy", String(enabled));
    return this;
  }

  /**
   * Build the query string
   */
  build(): string {
    return this.params.toString();
  }

  /**
   * Build the full URL
   */
  buildUrl(): string {
    const queryString = this.build();
    return queryString
      ? `${API_URL_SEARCH_PLUGINS}?${queryString}`
      : API_URL_SEARCH_PLUGINS;
  }

  /**
   * Execute the search and return results
   */
  async execute(): Promise<PluginSearchResult> {
    const url = this.buildUrl();
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Search failed: ${response.status} - ${error}`);
    }

    return response.json() as Promise<PluginSearchResult>;
  }
}

/**
 * Create a new plugin search query builder
 */
export function searchPlugins(): PluginSearchQueryBuilder {
  return new PluginSearchQueryBuilder();
}

// ============================================================================
// CLI OUTPUT FORMATTERS
// ============================================================================

function formatPluginResult(plugin: PluginResult, index: number): string {
  const lines: string[] = [];

  lines.push(
    chalk.green(`${index + 1}. ${plugin.name}`) +
      chalk.gray(` v${plugin.version}`) +
      (plugin.score !== undefined
        ? chalk.cyan(` (score: ${plugin.score})`)
        : "")
  );

  if (plugin.description) {
    const desc =
      plugin.description.length > 80
        ? plugin.description.slice(0, 77) + "..."
        : plugin.description;
    lines.push(chalk.gray(`   ${desc}`));
  }

  lines.push(
    chalk.gray(`   📦 npm: `) +
      chalk.yellow(plugin.npmPackage) +
      chalk.gray(` | 📁 ${plugin.category}`)
  );

  if (plugin.compatibleVersions) {
    lines.push(
      chalk.gray(`   🔧 Compatible with: `) +
        chalk.blue(plugin.compatibleVersions)
    );
  }

  return lines.join("\n");
}

function formatSearchResults(results: PluginSearchResult): void {
  if (results.plugins.length === 0) {
    console.log(chalk.yellow("\n⚠️  No plugins found matching your search.\n"));
    console.log(chalk.gray("Tips:"));
    console.log(chalk.gray("  • Try different keywords"));
    console.log(chalk.gray("  • Use fuzzy search (enabled by default)"));
    console.log(
      chalk.gray("  • Search by field: name:react, tag:ssr, author:john")
    );
    console.log(chalk.gray('  • Use exact phrases: "server side rendering"'));
    return;
  }

  console.log(chalk.bold.blue("\n🔍 Search Results:\n"));

  results.plugins.forEach((plugin, index) => {
    console.log(
      formatPluginResult(plugin, index + results.page * results.pageSize)
    );
    console.log("");
  });

  const currentPage = results.page + 1;
  const totalPages = Math.ceil(results.total / results.pageSize);

  console.log(
    chalk.gray(
      `Showing ${results.plugins.length} of ${results.total} results ` +
        `(page ${currentPage}/${totalPages})`
    )
  );

  if (currentPage < totalPages) {
    console.log(chalk.gray(`\nUse --page ${currentPage} to see the next page`));
  }
}

// ============================================================================
// CLI COMMAND
// ============================================================================

const searchCommand = new Command("search");

searchCommand
  .description("Search for Frame-Master plugins and templates")
  .addHelpText(
    "after",
    `
Examples:
  $ frame-master search plugins react
  $ frame-master search plugins "server side rendering"
  $ frame-master search plugins name:react-ssr
  $ frame-master search plugins tag:ssr -react
  $ frame-master search plugins --category ssr --limit 10
  $ frame-master search plugins --sort name --order asc

Advanced Query Syntax:
  "exact phrase"    Search for exact phrase match
  -term             Exclude results containing term
  name:value        Filter by plugin name
  tag:value         Filter by tag
  author:value      Filter by author
  npm:value         Filter by npm package name
  category:value    Filter by category
`
  );

searchCommand
  .command("plugins [query]")
  .description("Search for plugins by keyword or advanced query")
  .option("-c, --category <category>", "Filter by category")
  .option("-n, --name <name>", "Filter by exact plugin name")
  .option("-p, --page <page>", "Page number (0-indexed)", "0")
  .option("-l, --limit <limit>", "Results per page (1-100)", "25")
  .option(
    "-s, --sort <field>",
    "Sort by: relevance, name, created, updated",
    "relevance"
  )
  .option("-o, --order <order>", "Sort order: asc, desc", "desc")
  .option("--no-fuzzy", "Disable fuzzy matching")
  .option("--json", "Output results as JSON")
  .action(
    async (
      query: string | undefined,
      options: {
        category?: string;
        name?: string;
        page: string;
        limit: string;
        sort: string;
        order: string;
        fuzzy: boolean;
        json?: boolean;
      }
    ) => {
      try {
        const builder = searchPlugins();

        if (query) builder.query(query);
        if (options.category) builder.category(options.category);
        if (options.name) builder.name(options.name);

        builder
          .page(parseInt(options.page))
          .limit(parseInt(options.limit))
          .sortBy(options.sort as SortField)
          .order(options.order as SortOrder)
          .fuzzy(options.fuzzy);

        const results = await builder.execute();

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          formatSearchResults(results);
        }
      } catch (error) {
        console.error(
          chalk.red("❌ Search failed:"),
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    }
  );

export default searchCommand;
