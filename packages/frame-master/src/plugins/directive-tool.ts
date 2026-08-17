import type { DirectiveDefinition, Directives } from "./utils";

type DirectiveEntry = { path: string; route?: string };

export function createDirective<T extends Directives>(
	name: T,
	regex: RegExp,
): DirectiveDefinition<T> {
	return { name, regex };
}

export function createCustomDirective(
	name: string,
	regex: RegExp,
): DirectiveDefinition<string> {
	return { name, regex };
}

export class DirectiveTool {
	private entries: Map<string, Array<DirectiveEntry>> = new Map<
		string,
		Array<DirectiveEntry>
	>();
	private directiveToRegex: Map<string, RegExp> = new Map();
	private filePaths: string[] = [];
	private knownDirectives: Set<string> = new Set([
		"use-client",
		"use-server",
		"use-static",
		"server-only",
	]);

	constructor() {
		this.directiveToRegex.set(
			"use-client",
			/^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]client['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
		);
		this.directiveToRegex.set(
			"use-server",
			/^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]server['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
		);
		this.directiveToRegex.set(
			"use-static",
			/^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]static['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
		);
		this.directiveToRegex.set(
			"server-only",
			/^(?:\s*(?:\/\/.*?\n|\s)*)?['"]server[-\s]only['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
		);
	}

	addDirective<T extends string>(directive: T, regex: RegExp) {
		this.directiveToRegex.set(directive, regex);
		this.knownDirectives.add(directive);
		return this;
	}

	clearPaths() {
		this.filePaths = [];
	}

	static async getInstance(init?: Array<DirectiveEntry>) {
		const instance = new DirectiveTool();
		if (init) {
			await Promise.all(
				init.map((entry) => instance.addEntry(entry.path, entry.route)),
			);
		}
		return instance;
	}

	public async pathIs(
		directive: Directives,
		filePath: string,
		route?: string,
	): Promise<boolean> {
		if (!this.filePaths.includes(filePath))
			return (await this.addEntry(filePath, route)) === directive;
		return (
			this.entries.get(directive)?.some((entry) => entry.path === filePath) ??
			false
		);
	}

	public getFromDirective(directive: Directives): Array<DirectiveEntry> {
		return this.entries.get(directive as string) || [];
	}

	public getDirectiveFromRoute(route: string): string | null {
		for (const [directive, entries] of this.entries) {
			if (entries.some((entry) => entry.route === route)) {
				return directive;
			}
		}
		return null;
	}

	public getDirectiveFromFilePath(filePath: string): string | null {
		for (const [directive, entries] of this.entries) {
			if (entries.some((entry) => entry.path === filePath)) {
				return directive;
			}
		}
		return null;
	}

	public async addEntry(filePath: string, route?: string) {
		if (this.filePaths.includes(filePath))
			return this.getDirectiveFromFilePath(filePath) as string;
		const directive = await this.detectDirective(filePath);
		if (!this.entries.has(directive)) {
			this.entries.set(directive, []);
		}
		this.entries.get(directive)?.push({ path: filePath, route });
		this.filePaths.push(filePath);
		return directive;
	}

	private async detectDirective(filePath: string): Promise<string> {
		const file = Bun.file(filePath);
		if (!(await file.exists())) return "use-server";
		const fileContent = await file.text();
		const trimmedContent = fileContent.trimStart();

		for (const [directive, regex] of this.directiveToRegex) {
			if (regex.test(trimmedContent)) {
				return directive;
			}
		}
		return "use-server";
	}
}

export const directiveToolSingleton = new DirectiveTool();
