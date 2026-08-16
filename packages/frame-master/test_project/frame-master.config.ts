import type { FrameMasterConfig } from "frame-master/server/type";
import { buildPipeline } from "frame-master/plugin";

export default {
	HTTPServer: {
		port: 3000,
	},
	plugins: [
		{
			name: "debug-ui-demo-core",
			version: "1.0.0",
			build: {
				buildConfig: {
					entrypoints: ["./src/index.ts", "./src/admin.ts"],
					splitting: true,
					format: "esm",
					plugins: [
						{
							name: "annotate-entrypoints",
							setup(build) {
								build.onLoad({ filter: /\.ts$/ }, async (args) => {
									const source =
										(args.__chainedContents as string) ??
										(await Bun.file(args.path).text());
									return {
										contents: `const __traceLabel = ${JSON.stringify(args.path)};\n${source}`,
										loader: "ts",
									};
								});
							},
						},
						{
							name: "append-build-banner",
							setup(build) {
								build.onLoad({ filter: /\.ts$/ }, async (args) => {
									const source =
										(args.__chainedContents as string) ??
										(await Bun.file(args.path).text());
									return {
										contents:
											source + "\nconsole.log('debug-ui-demo pipeline ready');",
										loader: "ts",
									};
								});
							},
						},
						{
							name: "inject-build-meta",
							setup(build) {
								build.onLoad({ filter: /\.ts$/ }, async (args) => {
									const source =
										(args.__chainedContents as string) ??
										(await Bun.file(args.path).text());
									return {
										contents: `const __entryKind = ${JSON.stringify(
											args.path.split("/").at(-1) ?? "unknown",
										)};\n${source}`,
										loader: "ts",
									};
								});
							},
						},
					],
				},
			},
		},
		{
			name: "debug-ui-demo-transforms",
			version: "1.2.0",
			requirement: {
				frameMasterPlugins: {
					"debug-ui-demo-core": ">=1.0.0",
				},
			},
			build: {
				buildConfig: {
					entrypoints: ["./src/report.ts"],
					plugins: [
						{
							name: "append-build-banner",
							setup(build) {
								build.onLoad({ filter: /\.ts$/ }, async (args) => {
									const source =
										(args.__chainedContents as string) ??
										(await Bun.file(args.path).text());
									return {
										contents:
											source + "\nconsole.log('debug-ui-demo pipeline ready');",
										loader: "ts",
									};
								});

								build.finally("ts", async ({ contents }) => {
									return {
										contents: (contents as string) + "\nconst __finally=true;",
									};
								});
							},
						},
						{
							name: "rewrite-release-channel",
							setup(build) {
								build.onLoad({ filter: /\.ts$/ }, async (args) => {
									const source =
										(args.__chainedContents as string) ??
										(await Bun.file(args.path).text());
									return {
										contents: source.replaceAll("preview", "debug-atlas"),
										loader: "ts",
									};
								});
							},
						},
					],
				},
			},
		},
		{
			name: "debug-ui-demo-registry",
			version: "2.0.0",
			requirement: {
				frameMasterPlugins: {
					"debug-ui-demo-core": ">=1.0.0",
					"debug-ui-demo-transforms": ">=1.2.0",
				},
			},
			build: {
				buildConfig: {
					plugins: [
						{
							name: "trace-shape-sampler",
							setup(build) {
								build.onLoad({ filter: /\.ts$/ }, async (args) => {
									const source =
										(args.__chainedContents as string) ??
										(await Bun.file(args.path).text());
									return {
										contents:
											source + "\nvoid __traceLabel;\nvoid __entryKind;",
										loader: "ts",
									};
								});
							},
						},
					],
				},
			},
		},
		...buildPipeline({
			id: "preview",
			label: "Preview pipeline",
			plugins: [
					{
						name: "debug-ui-demo-preview",
						version: "1.0.0",
						build: {
							buildConfig: {
								entrypoints: ["./src/admin.ts"],
								outdir: ".frame-master/debug-pipeline-preview",
								format: "esm",
								plugins: [
									{
										name: "preview-pipeline-marker",
										setup(build) {
											build.onLoad({ filter: /\.ts$/ }, async (args) => {
												const source =
													(args.__chainedContents as string) ??
													(await Bun.file(args.path).text());
												return {
													contents: `const __debugPipeline = "preview";\n${source}\nconsole.log(__debugPipeline);`,
													loader: "ts",
												};
											});
										},
									},
								],
							},
						},
					},
			],
		}),
	],
} satisfies FrameMasterConfig;
