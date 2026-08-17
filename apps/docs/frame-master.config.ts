import { getBuilder } from "frame-master/build";
import {
	directiveToolSingleton,
	getGlobalPluginContext,
} from "frame-master/plugin/utils";
import { BuildUnifier } from "frame-master/plugin";
import type { FrameMasterConfig } from "frame-master/server/types";
import { isProd } from "frame-master/utils";
import ApplyReact from "frame-master-plugin-apply-react/plugin";
import AssetsToBuild from "frame-master-plugin-assets-to-build";
import AutoSiteMap from "frame-master-plugin-auto-sitemap";
import SSRPlugin from "frame-master-plugin-cloudflare-pages-dynamic-ssr";
import CFActionPlugin from "frame-master-plugin-cloudflare-pages-functions-action";
import CloudflareRouteFilePlugin from "frame-master-plugin-cloudflare-route-file-generator";
import EnvInHTML from "frame-master-plugin-env-in-html";
import searchIndex from "frame-master-plugin-html-search-engine";
import imageOptimizer from "frame-master-plugin-image-optimizer";
import MdxLoader from "frame-master-plugin-mdx-to-js-loader";
import nodeToBundlePlugin from "frame-master-plugin-node-polyfills";
import ReactToHTML from "frame-master-plugin-react-to-html";
import SEOPlugin from "frame-master-plugin-seo";
import ServeFromBuild from "frame-master-plugin-serve-from-build";
import TailwindPlugin from "frame-master-plugin-tailwind";
import SVGLoader from "frame-master-svg-to-jsx-loader";
import rehypePrettyCode from "rehype-pretty-code";
import remarkGfm from "remark-gfm";
import {
	addStaticRoute,
	collectStaticExcludeRules,
	createRouteTreeNode,
	DYNAMIC_ROUTE_SEGMENT_PATTERN,
	isNonPageRoute,
	markDynamicRoute,
} from "./.frame-master/optimization/cloudflare_route/hoffman_coding";
import SiteConfig from "./site.config";
import AsyncFallback from "./src/components/loading";

const WranglerServerPort = Number(process.env.WRANGLER_PORT || 8787);

const nodePolyfillPlugin = nodeToBundlePlugin();

const imgOptimizerPlugin = imageOptimizer({
	input: "images",
	output: "optimized",
	skipExisting: true,
	formats: ["webp"],
	keepOriginal: true,
	sizes: [320, 720, 1280],
});

export default {
	HTTPServer: {
		port: Number(process.env.PORT || 3000),
	},
	// The docs app carries plugins with staged Frame Master v4 migrations.
	pluginsOptions: {
		skipRequirementsCheck: true,
	},
	plugins: [
		ApplyReact({
			route: "src/pages",
			clientShellPath: "src/client-shell.tsx",
			entrypointExtensions: SiteConfig.frameworkConfig.routesExtensions,
			style: "nextjs",
			fallbacks: {
				defaultLoadingComponentPath: "src/components/loading.tsx",
				defaultNotFoundComponentPath: "src/components/404.tsx",
			},
			hydration: "hydrate",
		}),
		ReactToHTML({
			verbose: false,
			srcDir: "src/pages",
			shellPath: "src/shell.tsx",
			entrypointExtensions: SiteConfig.frameworkConfig.routesExtensions,
			asyncFallback: AsyncFallback,
			exclude: [/loading\.(tsx|jsx)$/, /404\.(tsx|jsx)$/],
		}),
		imgOptimizerPlugin,
		...BuildUnifier({
			plugins: [
				CFActionPlugin({
					actionBasePath: "src/actions",
					outDir: ".frame-master/build",
					serverPort: WranglerServerPort,
				}),
				SSRPlugin({
					actionBasePath: "src/actions",
					basePath: "src/pages",
					wrangler: {
						port: WranglerServerPort,
					},
					entrypointMatcher: [/.*layout\.tsx$/],
				}),
				{
					name: "env-vars-in-build",
					version: "1.0.0",
					virtualModules: {
						"@cf-process-env.js": {
							contents: `
								globalThis.process ??= {}; process.env ??= ${JSON.stringify({
									NODE_ENV: process.env.NODE_ENV,
									...Object.fromEntries(
										Object.entries(process.env).filter(([key]) =>
											key.startsWith("PUBLIC_"),
										),
									),
								})};`,
							injectRuntime: true,
							loader: "js",
						},
					},
					build: {
						buildConfig: {
							entrypoints: ["@cf-process-env.js"],
						},
					},
				},
				{
					name: "inject-virtual-module",
					version: "1.0.0",
					createContext() {
						getGlobalPluginContext("build-unifier")?.setBuildConfig?.(
							"inject-virtual-module",
							{
								buildConfig: {
									files: {
										"@apply-react/client-routes.ts": "export default {};",
										"@apply-react/HMR-enabled.ts": `export default false;`,
										"@apply-react/404.tsx":
											"export default () => <div>404 Not Found</div>;",
										"@apply-react/loading.tsx":
											"export default () => <div>Loading...</div>;",
									},
								},
							},
						);
					},
				},
				{
					name: "node-to-bundle",
					version: "1.0.0",
					createContext() {
						getGlobalPluginContext("build-unifier")?.setBuildConfig?.(
							"node-to-bundle",
							{
								buildConfig: nodePolyfillPlugin.build?.buildConfig,
							},
						);
					},
				},
				{
					name: "img-optimizer",
					version: "1.0.0",
					createContext() {
						getGlobalPluginContext("build-unifier")?.setBuildConfig?.(
							"img-optimizer",
							{
								buildConfig: imgOptimizerPlugin.build?.buildConfig,
							},
						);
					},
				},
			],
		}),
		{
			name: "proxy-to-wrangler",
			version: "0.1.0",
			serverConfig: {
				routes: {
					"/*": async (req) => {
						const url = new URL(req.url);
						url.port = String(WranglerServerPort);
						url.hostname = "127.0.0.1";
						const headers = new Headers(req.headers);
						headers.set("host", `127.0.0.1:${WranglerServerPort}`);
						headers.delete("accept-encoding");
						const hasBody =
							req.method !== "GET" &&
							req.method !== "HEAD" &&
							req.body !== null;
						try {
							const response = await fetch(url, {
								method: req.method,
								headers,
								body: hasBody ? req.body : undefined,
								redirect: "manual",
							});
							response.headers.delete("content-encoding");
							return response;
						} catch {
							return new Response("Bad Gateway: upstream unavailable", {
								status: 502,
							});
						}
					},
				},
			},
			build: {
				buildConfig: {
					splitting: true,
				},
			},
			async serverReady({ builder }) {
				await builder.build();
			},
		},
		ServeFromBuild({
			buildDir: ".frame-master/build",
			plainURLPaths: ["index.html"],
			buildOnDevStart: true,
		}),
		EnvInHTML({
			entries: ["NODE_ENV"],
			prefix: "PUBLIC_",
		}),
		TailwindPlugin({
			inputFile: "static/tailwind.css",
			outputFile: "static/style.css",
			options: {
				autoInjectInBuild: true,
				runtime: "bun",
			},
		}),
		SVGLoader(),
		AssetsToBuild({
			paths: [
				{
					src: "optimized",
					dist: "optimized",
				},
				{
					src: "static/favicon.ico",
					dist: "favicon.ico",
				},
				{
					src: "assets",
					dist: "assets",
				},
				{
					src: "robots.txt",
					dist: "robots.txt",
				},
				{
					src: "404.html",
					dist: "404.html",
				},
			],
		}),
		SEOPlugin(SiteConfig.SEO),
		AutoSiteMap({
			baseUrl: SiteConfig.siteUrl,
			authorizedExtensions: ["html"],
		}),
		{
			name: "static-assets",
			version: "1.0.0",
			build: {
				buildConfig: {
					naming: {
						asset: "[dir]/[name].[ext]",
					},
				},
			},
		},
		{
			name: "dev-plugin",
			version: "1.0.0",
			fileSystemWatchDir: ["src"],
			async onFileSystemChange(_ev, _fp, abs) {
				const builder = getBuilder();
				if (!abs.startsWith("src/") || builder?.isBuilding()) return;
				await builder?.build();
			},
		},
		searchIndex({
			classNameToParse: ["doc-title", "doc-content"],
		}),
		MdxLoader({
			mdxOptions: {
				remarkPlugins: [remarkGfm],
				rehypePlugins: [
					[
						rehypePrettyCode,
						{
							theme: {
								dark: "one-dark-pro",
								light: "github-light",
							},
							keepBackground: false,
						},
					],
				],
			},
		}),
		CloudflareRouteFilePlugin({
			routeOptions: () => {
				const dynamicFilePath = new Set(
					directiveToolSingleton
						.getFromDirective("use-dynamic")
						.map((directive) => directive.path),
				);
				const routeTree = createRouteTreeNode();

				const routes = Object.entries(
					new Bun.FileSystemRouter({
						dir: "src/pages",
						fileExtensions: SiteConfig.frameworkConfig.routesExtensions,
						style: "nextjs",
					}).routes,
				).sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));

				for (const [pathname, filePath] of routes) {
					if (isNonPageRoute(pathname)) continue;

					if (
						dynamicFilePath.has(filePath) ||
						DYNAMIC_ROUTE_SEGMENT_PATTERN.test(pathname)
					) {
						markDynamicRoute(routeTree, pathname);
						continue;
					}

					addStaticRoute(routeTree, pathname);
				}

				const excludedStaticRoutes = collectStaticExcludeRules(routeTree).sort(
					(leftPath, rightPath) => leftPath.localeCompare(rightPath),
				);

				return {
					version: 1,
					include: ["/*"],
					exclude: [
						...excludedStaticRoutes,
						"/optimized/*",
						"/static/*",
						"/assets/*",
						"/favicon.ico",
						"/robots.txt",
						"/@cf-process-env.js",
						"/@dynamic-ssr-endpoints.js",
						"/chunks/*",
					],
				};
			},
		}),
		{
			name: "optimization-plugin",
			version: "1.0.0",
			build: {
				buildConfig: {
					minify: isProd(),
					splitting: true,
					naming: {
						chunk: "chunks/chunk-[hash].[ext]",
						asset: "[dir]/[name].[ext]",
					},
				},
			},
		},
		nodePolyfillPlugin,
	],
} satisfies FrameMasterConfig;
