export function navigate(href: string) {
	const a = document.createElement("a");
	a.href = href;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

export function searchParams(id: string): string | null {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	return params.get(id);
}

export function passwordValid(password: string):
	| {
			valid: false;
			reason: string;
	  }
	| {
			valid: true;
			reason?: undefined;
	  } {
	const reasons: string[] = [];

	if (password.length < 8) {
		reasons.push("at least 8 characters long");
	}

	return reasons.length > 0
		? {
				valid: false as const,
				reason: `Password must be ${reasons.join(", ")}`,
			}
		: { valid: true as const };
}

export const SocialLinks = {
	discord: "https://discord.gg/DzcPejNX",
	github: "https://github.com/shpaw415/frame-master",
} as const;

export const routes = {
	home: "/",
	login: "/login",
	register: "/register",
	forgotPassword: "/forgot-password",
	resetPassword: "/reset-password",
	confirmEmail: "/register/confirm-email",
	welcome: "/welcome",
	plugins: "/plugins",
	templates: "/templates",
	settings: "/settings",
	createPlugin: "/plugins/add",
	createTemplate: "/templates/add",
	community: "/community",
	dashboard: "/dashboard",
	confirmUser: "/register-new-user",
	releaseNotes: "release",
	blog: "/blog",
	editPlugin: (id: string) =>
		`/plugins/add?id=${id}` as `/plugins/add?id=${string}`,
	showPlugin: (id: string) =>
		`/plugins/package?id=${id}` as `/plugins/package?id=${string}`,
	editTemplate: (id: string) =>
		`/templates/edit?id=${id}` as `/templates/edit?id=${string}`,
	showTemplate: (id: string) =>
		`/templates/package/${id}` as `/templates/package/${string}`,
	profile: (userId: string) =>
		`/profile?id=${userId}` as `/profile?id=${string}`,
	admin: {
		index: "/admin",
		logs: "/admin/logs",
		plugin: "/admin/plugin",
		release: "/admin/release",
		user: "/admin/user",
		templates: "/admin/templates",
	},
	docs: {
		index: "/docs",
		install: "/docs/installation",
		quickStart: "/docs/start",
		projectStructure: "/docs/project-structure",
		core: {
			configuration: "/docs/core/configuration",
			context: "/docs/core/context",
			httpServer: "/docs/core/http-server",
			requestHandling: "/docs/core/request-handling",
			build: "/docs/core/build",
		},
		plugins: {
			overview: "/docs/plugins",
			install: "/docs/plugins/installing",
			creating: "/docs/plugins/creating",
			lifeCycle: "/docs/plugins/lifecycle",
			hooks: "/docs/plugins/hooks",
			chaining: "/docs/plugins/chaining",
			testPlugins: "/docs/plugins/test",
		},
		cli: {
			overview: "/docs/cli",
			create: "/docs/cli/create",
			init: "/docs/cli/init",
			dev: "/docs/cli/dev",
			start: "/docs/cli/start",
			build: "/docs/cli/build",
			debug: "/docs/cli/debug",
			plugin: "/docs/cli/plugin",
			test: "/docs/cli/test",
			extended: "/docs/cli/extended",
		},
		apireference: {
			configType: "/docs/api/config-types",
			pluginType: "/docs/api/plugin-types",
			requestManager: "/docs/api/request-manager",
			utils: "/docs/api/utils",
		},
		blog: "/blog",
		login: "/login",
		register: "/register",
		community: "/community",
	},
} as const;

export async function getDownloadsCountFromNpm(
	packageName: string,
): Promise<number> {
	return fetch(
		`https://api.npmjs.org/downloads/point/1970-01-01:${
			new Date().toISOString().split("T")[0]
		}/${packageName}`,
	)
		.then((res) => {
			if (!res.ok) {
				throw new Error("Failed to fetch download counts");
			}
			return res.json() as Promise<{ downloads: number }>;
		})
		.then((data) => data.downloads)
		.catch(() => 0);
}

export class CacheManager<Keys extends string> {
	private cache: Map<string, unknown>;

	constructor() {
		this.cache = new Map();
	}

	async fetch<T>(id: Keys, getter: () => Promise<T>): Promise<T> {
		if (this.cache.has(id)) {
			const cached = this.cache.get(id);
			if (cached instanceof Promise) {
				return cached as Promise<T>;
			}
			return Promise.resolve(cached) as Promise<T>;
		} else {
			const prom = getter().then((data) => {
				this.cache.set(id, data);
				return data;
			});
			this.cache.set(id, prom);
			return prom;
		}
	}

	clear(id: Keys) {
		this.cache.delete(id);
	}

	clearAll() {
		this.cache.clear();
	}

	get<T>(id: Keys): T | null {
		return (this.cache.get(id) as T) || null;
	}
}
