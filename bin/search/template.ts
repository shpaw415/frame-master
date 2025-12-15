import chalk from "chalk";
import { BASE_API_URL } from "./share";
import { Command } from "commander";

const API_URL_SEARCH_TEMPLATES = BASE_API_URL + "/templates";

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
  // Optional fields when using --include or --full
  longDescription?: string | null;
  ownerId?: string;
  tags?: string[];
  published?: boolean;
  installation?: string | null;
  features?: string[] | null;
  includedPlugins?: string[];
  previewUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type TemplateSearchResult = {
  templates: TemplateResult[];
  total: number;
  page: number;
  pageSize: number;
};

// ============================================================================
// QUERY BUILDER
// ============================================================================

type SortField = "relevance" | "name" | "created" | "updated";
type SortOrder = "asc" | "desc";

class TemplateSearchQueryBuilder {
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
   * Filter by exact template name
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
   * Include additional fields in the response
   * Currently supports: "longDescription"
   */
  include(field: "longDescription"): this {
    this.params.set("include", field);
    return this;
  }

  /**
   * Include all template fields in the response
   */
  full(enabled: boolean): this {
    if (enabled) this.params.set("full", "true");
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
      ? `${API_URL_SEARCH_TEMPLATES}?${queryString}`
      : API_URL_SEARCH_TEMPLATES;
  }

  /**
   * Execute the search and return results
   */
  async execute(): Promise<TemplateSearchResult> {
    const url = this.buildUrl();
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Search failed: ${response.status} - ${error}`);
    }

    return response.json() as Promise<TemplateSearchResult>;
  }
}

/**
 * Create a new template search query builder
 */
export function searchTemplates(): TemplateSearchQueryBuilder {
  return new TemplateSearchQueryBuilder();
}

// ============================================================================
// CLI OUTPUT FORMATTERS
// ============================================================================

function formatTemplateResult(
  template: TemplateResult,
  index: number,
  showFull: boolean = false
): string {
  const lines: string[] = [];

  lines.push(
    chalk.green(`${index + 1}. ${template.icon} ${template.name}`) +
      chalk.gray(` v${template.defaultVersion}`) +
      (template.score !== undefined
        ? chalk.cyan(` (score: ${template.score})`)
        : "")
  );

  if (template.description) {
    const desc =
      template.description.length > 80 && !showFull
        ? template.description.slice(0, 77) + "..."
        : template.description;
    lines.push(chalk.gray(`   ${desc}`));
  }

  lines.push(
    chalk.gray(`   👤 Author: `) +
      chalk.yellow(template.author) +
      chalk.gray(` | 📁 ${template.category}`)
  );

  lines.push(chalk.gray(`   🔗 GitHub: `) + chalk.cyan(template.githubRepoUrl));

  // Show long description if available
  if (template.longDescription) {
    const longDesc = showFull
      ? template.longDescription
      : template.longDescription.length > 120
      ? template.longDescription.slice(0, 117) + "..."
      : template.longDescription;
    lines.push(chalk.gray(`   📝 ${longDesc}`));
  }

  // Show additional fields when full mode
  if (showFull) {
    if (template.tags && template.tags.length > 0) {
      lines.push(
        chalk.gray(`   🏷️  Tags: `) + chalk.magenta(template.tags.join(", "))
      );
    }
    if (template.includedPlugins && template.includedPlugins.length > 0) {
      lines.push(
        chalk.gray(`   🔌 Plugins: `) +
          chalk.blue(template.includedPlugins.join(", "))
      );
    }
    if (template.features && template.features.length > 0) {
      lines.push(
        chalk.gray(`   ✨ Features: `) +
          chalk.white(template.features.join(", "))
      );
    }
    if (template.previewUrl) {
      lines.push(
        chalk.gray(`   🌐 Preview: `) + chalk.cyan(template.previewUrl)
      );
    }
    if (template.githubReleaseUrl) {
      lines.push(
        chalk.gray(`   📦 Release: `) + chalk.cyan(template.githubReleaseUrl)
      );
    }
  }

  return lines.join("\n");
}

function formatSearchResults(
  results: TemplateSearchResult,
  showFull: boolean = false
): void {
  if (results.templates.length === 0) {
    console.log(
      chalk.yellow("\n⚠️  No templates found matching your search.\n")
    );
    console.log(chalk.gray("Tips:"));
    console.log(chalk.gray("  • Try different keywords"));
    console.log(chalk.gray("  • Use fuzzy search (enabled by default)"));
    console.log(
      chalk.gray("  • Search by field: name:react, tag:ssr, author:john")
    );
    console.log(chalk.gray('  • Use exact phrases: "server side rendering"'));
    return;
  }

  console.log(chalk.bold.blue("\n🔍 Template Search Results:\n"));

  results.templates.forEach((template, index) => {
    console.log(
      formatTemplateResult(
        template,
        index + results.page * results.pageSize,
        showFull
      )
    );
    console.log("");
  });

  const currentPage = results.page + 1;
  const totalPages = Math.ceil(results.total / results.pageSize);

  console.log(
    chalk.gray(
      `Showing ${results.templates.length} of ${results.total} results ` +
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

const templateSearchCommand = new Command("templates");

templateSearchCommand
  .description("Search for Frame-Master project templates")
  .addHelpText(
    "after",
    `
Examples:
  $ frame-master search templates react
  $ frame-master search templates "full stack"
  $ frame-master search templates name:react-ssr-template
  $ frame-master search templates tag:ssr -minimal
  $ frame-master search templates --category starter --limit 10
  $ frame-master search templates --sort name --order asc

Advanced Query Syntax:
  "exact phrase"    Search for exact phrase match
  -term             Exclude results containing term
  name:value        Filter by template name
  tag:value         Filter by tag
  author:value      Filter by author
  npm:value         Filter by npm package name
  category:value    Filter by category
`
  )
  .argument("[query]", "Search query")
  .option("-c, --category <category>", "Filter by category")
  .option("-n, --name <name>", "Filter by exact template name")
  .option("-p, --page <page>", "Page number (0-indexed)", "0")
  .option("-l, --limit <limit>", "Results per page (1-100)", "25")
  .option(
    "-s, --sort <field>",
    "Sort by: relevance, name, created, updated",
    "relevance"
  )
  .option("-o, --order <order>", "Sort order: asc, desc", "desc")
  .option("--no-fuzzy", "Disable fuzzy matching")
  .option("--include <field>", "Include additional field (longDescription)")
  .option("--full", "Include all template fields in results")
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
        include?: string;
        full?: boolean;
        json?: boolean;
      }
    ) => {
      try {
        const builder = searchTemplates();

        if (query) builder.query(query);
        if (options.category) builder.category(options.category);
        if (options.name) builder.name(options.name);

        builder
          .page(parseInt(options.page, 10) || 0)
          .limit(parseInt(options.limit, 10) || 25)
          .sortBy(options.sort as SortField)
          .order(options.order as SortOrder)
          .fuzzy(options.fuzzy);

        if (options.include === "longDescription") {
          builder.include("longDescription");
        }
        if (options.full) {
          builder.full(true);
        }

        const results = await builder.execute();

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          formatSearchResults(
            results,
            options.full || options.include === "longDescription"
          );
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

export default templateSearchCommand;
