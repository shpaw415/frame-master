import { routes } from "@/utils";
export type DocSection = {
	title: string;
	items: {
		title: string;
		href: string;
		badge?: string;
	}[];
};

export const docSections = [
	{
		title: "Getting Started",
		items: [
			{ title: "Introduction", href: routes.docs.index, badge: "Start Here" },
			{ title: "Installation", href: routes.docs.install },
			{ title: "Quickstart", href: routes.docs.quickStart },
			{ title: "Project Structure", href: routes.docs.projectStructure },
		],
	},
	{
		title: "Core",
		items: [
			{ title: "Configuration", href: routes.docs.core.configuration },
			{ title: "Global Context", href: routes.docs.core.context },
			{ title: "HTTP Server", href: routes.docs.core.httpServer },
			{ title: "Request Handling", href: routes.docs.core.requestHandling },
			{ title: "Build Process", href: routes.docs.core.build },
		],
	},
	{
		title: "Plugin System",
		items: [
			{ title: "Overview", href: routes.docs.plugins.overview },
			{ title: "Installing Plugins", href: routes.docs.plugins.install },
			{ title: "Creating Plugins", href: routes.docs.plugins.creating },
			{ title: "Plugin Lifecycle", href: routes.docs.plugins.lifeCycle },
			{ title: "Plugin Hooks", href: routes.docs.plugins.hooks },
			{
				title: "Plugin Chaining & Virtual Modules",
				href: routes.docs.plugins.chaining,
			},
			{ title: "Testing plugins", href: routes.docs.plugins.testPlugins },
		],
	},
	{
		title: "CLI",
		items: [
			{ title: "Commands Overview", href: routes.docs.cli.overview },
			{ title: "create", href: routes.docs.cli.create },
			{ title: "init", href: routes.docs.cli.init },
			{ title: "dev", href: routes.docs.cli.dev },
			{ title: "start", href: routes.docs.cli.start },
			{ title: "build", href: routes.docs.cli.build },
			{ title: "debug", href: routes.docs.cli.debug },
			{ title: "plugin", href: routes.docs.cli.plugin },
			{ title: "test", href: routes.docs.cli.test },
		],
	},
	{
		title: "API Reference",
		items: [
			{
				title: "Configuration Types",
				href: routes.docs.apireference.configType,
			},
			{ title: "Plugin Types", href: routes.docs.apireference.pluginType },
			{
				title: "Request Manager",
				href: routes.docs.apireference.requestManager,
			},
			{ title: "Runtime Utilities", href: routes.docs.apireference.utils },
		],
	},
] as const satisfies DocSection[];
