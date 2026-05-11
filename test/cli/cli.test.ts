import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * CLI Test Suite for Frame-Master
 *
 * Tests the CLI commands using Bun's shell execution and test API.
 * Creates temporary test projects to verify CLI behavior.
 */

const TEST_DIR = join(tmpdir(), `frame-master-cli-test-${Date.now()}`);
const CLI_PATH = join(__dirname, "..", "..", "bin", "index.ts");

async function waitForJson<T>(
	url: string,
	assertion: (value: T) => boolean,
	timeoutMs = 10000,
) {
	const startedAt = Date.now();
	let lastValue: T | null = null;

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				lastValue = (await response.json()) as T;
				if (assertion(lastValue)) {
					return lastValue;
				}
			}
		} catch {
			// Server may still be booting.
		}

		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	throw new Error(
		`Timed out waiting for JSON assertion at ${url}: ${JSON.stringify(lastValue)}`,
	);
}

beforeAll(() => {
	// Create test directory
	mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
	// Cleanup test directory
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
});

describe("frame-master CLI", () => {
	describe("version and help", () => {
		test("should display version with --version", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "--version"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toMatch(/\d+\.\d+\.\d+/); // Semantic version format
			expect(proc.exitCode).toBe(0);
		});

		test("should display help with --help", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("frame-master");
			expect(output).toContain("dev");
			expect(output).toContain("start");
			expect(output).toContain("init");
			expect(output).toContain("create");
			expect(output).toContain("plugin");
			expect(proc.exitCode).toBe(0);
		});

		test("should display help with -h", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "-h"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("Usage:");
			expect(proc.exitCode).toBe(0);
		});
	});

	describe("create command", () => {
		test("should display help for create command", async () => {
			const res = Bun.spawnSync({
				cmd: ["bun", CLI_PATH, "create", "--help"],
			});

			const out =
				new TextDecoder().decode(res.stdout) +
				new TextDecoder().decode(res.stderr);

			expect(out).toContain("Create a new frame-master project");
			expect(out).toContain("minimal");
			expect(out).toContain("-t, --type");
		});

		test("should create a minimal project", async () => {
			const projectName = "test-minimal-project";
			const projectPath = join(TEST_DIR, projectName);

			const proc = Bun.spawnSync(
				["bun", CLI_PATH, "create", projectName, "--type", "minimal"],
				{
					cwd: TEST_DIR,
					stdout: "pipe",
					stderr: "pipe",
				},
			);

			const output = Bun.stripANSI(new TextDecoder().decode(proc.stdout));

			// Check if project was created
			expect(existsSync(projectPath)).toBe(true);
			expect(existsSync(join(projectPath, "package.json"))).toBe(true);
			expect(existsSync(join(projectPath, "frame-master.config.ts"))).toBe(
				true,
			);
			expect(existsSync(join(projectPath, ".frame-master"))).toBe(true);
			expect(existsSync(join(projectPath, "bunfig.toml"))).toBe(true);

			// Check success message
			expect(output).toContain("Successfully created");
			expect(output).toContain(projectName);
		}, 30000); // Longer timeout for project creation
	});

	describe("init command", () => {
		test("should display help for init command", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "init", "--help"], {
				cwd: TEST_DIR,
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("Initialize frame-master");
			expect(proc.exitCode).toBe(0);
		});

		test("should initialize frame-master in existing project", async () => {
			const projectName = "test-init-project";
			const projectPath = join(TEST_DIR, projectName);

			// Create a basic project structure
			mkdirSync(projectPath, { recursive: true });
			writeFileSync(
				join(projectPath, "package.json"),
				JSON.stringify(
					{
						name: projectName,
						version: "1.0.0",
						scripts: {},
					},
					null,
					2,
				),
			);

			// Install frame-master (simulate)
			await Bun.$`bun add frame-master`.cwd(projectPath).quiet();

			// Run init
			const proc = await Bun.$`bun ${CLI_PATH} init`
				.cwd(projectPath)
				.catch((e) => {
					console.error(Bun.stripANSI(e.message));
				})
				.then((p) => p);

			if (!proc) throw new Error("Failed to run init command");

			const output = proc.text();

			console.log("out:", output);

			// Check if files were created
			expect(existsSync(join(projectPath, "frame-master.config.ts"))).toBe(
				true,
			);
			expect(existsSync(join(projectPath, ".frame-master"))).toBe(true);
			expect(existsSync(join(projectPath, "bunfig.toml"))).toBe(true);
			expect(existsSync(join(projectPath, ".env"))).toBe(true);

			// Check package.json scripts
			const packageJson = JSON.parse(
				await Bun.file(join(projectPath, "package.json")).text(),
			);
			expect(packageJson.scripts.dev).toBeDefined();
			expect(packageJson.scripts.start).toBeDefined();

			expect(output).toContain("initialized");
			expect(proc.exitCode).toBe(0);
		}, 30000);

		test("should not overwrite existing files", async () => {
			const projectName = "test-no-overwrite";
			const projectPath = join(TEST_DIR, projectName);

			mkdirSync(projectPath, { recursive: true });
			writeFileSync(
				join(projectPath, "package.json"),
				JSON.stringify({ name: projectName, version: "1.0.0" }, null, 2),
			);

			// Create existing config file
			const existingConfig = `export default {
      HTTPServer: {
        port: 0,
      },
      plugins: [],
      };`;
			writeFileSync(
				join(projectPath, "frame-master.config.ts"),
				existingConfig,
			);

			await Bun.$`bun add frame-master`.cwd(projectPath).quiet();

			const proc = Bun.spawn(["bun", CLI_PATH, "init"], {
				cwd: projectPath,
				stdout: "pipe",
				stderr: "pipe",
			});

			const stdout = Bun.stripANSI(await new Response(proc.stdout).text());
			const stderr = Bun.stripANSI(await new Response(proc.stderr).text());

			await proc.exited;

			// Check that existing file wasn't overwritten
			const configContent = await Bun.file(
				join(projectPath, "frame-master.config.ts"),
			).text();
			expect(configContent).toBe(existingConfig);

			// Warning goes to stderr
			expect(stderr).toContain("already exists");
			expect(stdout).toContain("initialized");
		}, 30000);
	});

	describe("build command", () => {
		test("should display help for build command", async () => {
			const proc = await Bun.$`bun ${CLI_PATH} build --help`.cwd(process.cwd());

			expect(Bun.stripANSI(proc.text())).toContain(
				"Build the Frame Master project",
			);
			expect(proc.exitCode).toBe(0);
		});

		test("should build project successfully", async () => {
			const projectName = "test-build-project";
			const projectPath = join(TEST_DIR, projectName);

			// Create project structure
			mkdirSync(join(projectPath, "src"), { recursive: true });
			mkdirSync(join(projectPath, ".frame-master/build"), { recursive: true });

			const testProjectEntryPoint = join(
				projectPath,
				"src",
				"index.ts",
			).replaceAll("\\", "/");

			// Create minimal config
			const configContent = (
				await Bun.file(join(import.meta.dir, "default.config.ts")).text()
			).replaceAll("{{TEST_PROJECT_ENTRYPOINT}}", testProjectEntryPoint);

			await Bun.write(
				join(projectPath, "frame-master.config.ts"),
				configContent,
			);

			// Create a simple entrypoint
			await Bun.write(
				testProjectEntryPoint,
				`console.log("Hello Frame Master");`,
			);

			// Set NODE_ENV
			process.env.NODE_ENV = "development";

			const stdout = await Bun.$`bun ${CLI_PATH} build`
				.cwd(projectPath)
				.env({ ...process.env, NODE_ENV: "development" })
				.catch((e) => e);

			const output = Bun.stripANSI(stdout.text());

			expect(output).toMatch(/Starting Frame Master Build|Build Completed/);
			expect(stdout.exitCode).toBe(0);
		}, 30000);

		test("should handle build errors gracefully", async () => {
			const projectName = "test-build-error";
			const projectPath = join(TEST_DIR, projectName);

			mkdirSync(join(projectPath, ".frame-master"), { recursive: true });

			const proc = await Bun.$`bun ${CLI_PATH} build`
				.env({ NODE_ENV: "development" })
				.cwd(projectPath)
				.catch((e) => e);

			expect(proc.exitCode).toBe(1);
		}, 30000);

		test("should require NODE_ENV to be set", async () => {
			const projectName = "test-build-no-env";
			const projectPath = join(TEST_DIR, projectName);

			mkdirSync(projectPath, { recursive: true });

			const proc = Bun.spawn(["bun", CLI_PATH, "build"], {
				cwd: projectPath,
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, NODE_ENV: undefined },
			});

			const stderr = await new Response(proc.stderr).text();
			await proc.exited;

			expect(stderr).toContain("NODE_ENV");
			expect(proc.exitCode).toBe(1);
		}, 15000);
	});

	describe("debug build command", () => {
		test("should display help for debug build command", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "debug", "build", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("instrumented build");
			expect(output).toContain("--save-trace");
			expect(proc.exitCode).toBe(0);
		});

		test("should start debug server and expose trace APIs", async () => {
			const projectName = "test-debug-build-project";
			const projectPath = join(TEST_DIR, projectName);
			mkdirSync(join(projectPath, "src"), { recursive: true });

			const entrypointFilePath = join(projectPath, "src", "index.ts");
			const entrypointConfigPath = "./src/index.ts";
			writeFileSync(entrypointFilePath, `console.log("debug build");`);

			writeFileSync(
				join(projectPath, "frame-master.config.ts"),
				`
import type { FrameMasterConfig } from "frame-master/server/type";

export default {
  HTTPServer: { port: 3055 },
  plugins: [
    {
      name: "debug-trace-plugin",
      version: "1.0.0",
      build: {
        buildConfig: {
					entrypoints: ["${entrypointConfigPath}"],
          plugins: [
            {
              name: "append-debug-marker",
              setup(build) {
								build.onLoad({ filter: /[.]ts$/ }, async (args) => {
                  const text = await Bun.file(args.path).text();
                  return {
										contents: text + "\\nconsole.log('trace marker');",
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
} satisfies FrameMasterConfig;
`,
			);

			const proc = Bun.spawn(
				["bun", CLI_PATH, "debug", "build", "--no-watch", "--port", "3311"],
				{
					cwd: projectPath,
					stdout: "pipe",
					stderr: "pipe",
					env: { ...process.env, NODE_ENV: "development" },
				},
			);

			try {
				const builds = await waitForJson<
					Array<{ id: string; fileCount: number }>
				>(
					"http://localhost:3311/api/builds",
					(value) => value.length === 1 && (value[0]?.fileCount ?? 0) > 0,
				);
				const session = await waitForJson<{ buildList: Array<{ id: string }> }>(
					"http://localhost:3311/api/session",
					(value) => value.buildList.length === 1,
				);
				const registry = await waitForJson<
					Array<{ name: string; metrics: { interventions: number } }>
				>("http://localhost:3311/api/registry", (value) =>
					value.some(
						(entry) =>
							entry.name === "append-debug-marker" &&
							entry.metrics.interventions > 0,
					),
				);
				const firstBuild = builds[0];
				if (!firstBuild) {
					throw new Error("Expected first debug build summary");
				}
				const build = await waitForJson<{
					files: Array<{ steps: Array<{ kind: string }> }>;
				}>(
					`http://localhost:3311/api/builds/${firstBuild.id}`,
					(value) =>
						value.files.length > 0 &&
						(value.files[0]?.steps ?? []).some(
							(step) => step.kind === "final-output",
						),
				);
				const firstSessionBuild = session.buildList[0];
				const firstFile = build.files[0];
				if (!firstSessionBuild || !firstFile) {
					throw new Error("Expected debug build details to be present");
				}

				expect(builds).toHaveLength(1);
				expect(
					registry.some((entry) => entry.name === "debug-trace-plugin"),
				).toBe(true);
				expect(firstSessionBuild.id).toBe(firstBuild.id);
				expect(firstFile.steps.some((step) => step.kind === "onLoad")).toBe(
					true,
				);
			} finally {
				proc.kill();
				await proc.exited;
			}
		}, 30000);

		test("should stream rebuild updates and keep a navigable build list", async () => {
			const projectName = "test-debug-build-watch";
			const projectPath = join(TEST_DIR, projectName);
			mkdirSync(join(projectPath, "src"), { recursive: true });

			const entrypointFilePath = join(projectPath, "src", "index.ts");
			const entrypointConfigPath = "./src/index.ts";
			writeFileSync(entrypointFilePath, `console.log("watch build");`);

			writeFileSync(
				join(projectPath, "frame-master.config.ts"),
				`
import type { FrameMasterConfig } from "frame-master/server/type";

export default {
  HTTPServer: { port: 3056 },
  plugins: [
    {
      name: "debug-watch-plugin",
      version: "1.0.0",
      build: {
        buildConfig: {
					entrypoints: ["${entrypointConfigPath}"],
          plugins: [
            {
              name: "append-watch-marker",
              setup(build) {
								build.onLoad({ filter: /[.]ts$/ }, async (args) => {
                  const text = await Bun.file(args.path).text();
                  return {
										contents: text + "\\nconsole.log('watch marker');",
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
} satisfies FrameMasterConfig;
`,
			);

			const proc = Bun.spawn(
				["bun", CLI_PATH, "debug", "build", "--port", "3312"],
				{
					cwd: projectPath,
					stdout: "pipe",
					stderr: "pipe",
					env: { ...process.env, NODE_ENV: "development" },
				},
			);

			const messages: Array<{ type: string }> = [];
			let ws: WebSocket | null = null;

			try {
				await waitForJson<Array<{ id: string }>>(
					"http://localhost:3312/api/builds",
					(value) => value.length === 1,
				);

				ws = new WebSocket("ws://localhost:3312/ws");
				ws.onmessage = (event) => {
					messages.push(JSON.parse(event.data));
				};

				await new Promise((resolve, reject) => {
					const timeout = setTimeout(
						() => reject(new Error("WebSocket open timeout")),
						5000,
					);
					const socket = ws;
					if (!socket) {
						clearTimeout(timeout);
						reject(new Error("WebSocket was not created"));
						return;
					}
					socket.onopen = () => {
						clearTimeout(timeout);
						resolve(undefined);
					};
				});

				writeFileSync(
					entrypointFilePath,
					`console.log("watch build changed");`,
				);

				const builds = await waitForJson<Array<{ sequence: number }>>(
					"http://localhost:3312/api/builds",
					(value) => value.length === 2 && value[0]?.sequence === 2,
					15000,
				);

				expect(builds).toHaveLength(2);
				expect(
					messages.some((message) => message.type === "watcher-change"),
				).toBe(true);
				expect(
					messages.some((message) => message.type === "build-list-updated"),
				).toBe(true);
				expect(
					messages.some((message) => message.type === "step-appended"),
				).toBe(true);
			} finally {
				ws?.close();
				proc.kill();
				await proc.exited;
			}
		}, 45000);

		test("should save the trace to disk when --save-trace is provided", async () => {
			const projectName = "test-debug-build-save-trace";
			const projectPath = join(TEST_DIR, projectName);
			mkdirSync(join(projectPath, "src"), { recursive: true });

			const entrypointFilePath = join(projectPath, "src", "index.ts");
			const entrypointConfigPath = "./src/index.ts";
			const tracePath = join(projectPath, "artifacts", "trace.json");

			writeFileSync(entrypointFilePath, `console.log("save trace build");`);
			writeFileSync(
				join(projectPath, "frame-master.config.ts"),
				`
import type { FrameMasterConfig } from "frame-master/server/type";

export default {
  HTTPServer: { port: 3057 },
  plugins: [
    {
      name: "debug-save-plugin",
      version: "1.0.0",
      build: {
        buildConfig: {
					entrypoints: ["${entrypointConfigPath}"],
        },
      },
    },
  ],
} satisfies FrameMasterConfig;
`,
			);

			const proc = Bun.spawn(
				[
					"bun",
					CLI_PATH,
					"debug",
					"build",
					"--no-watch",
					"--port",
					"3313",
					"--save-trace",
					"artifacts/trace.json",
				],
				{
					cwd: projectPath,
					stdout: "pipe",
					stderr: "pipe",
					env: { ...process.env, NODE_ENV: "development" },
				},
			);

			try {
				await waitForJson<{ buildList: Array<{ id: string }> }>(
					"http://localhost:3313/api/session",
					(value) => value.buildList.length === 1,
				);

				await waitForJson<Array<{ id: string }>>(
					"http://localhost:3313/api/builds",
					() => existsSync(tracePath),
				);

				const savedTrace = JSON.parse(await Bun.file(tracePath).text()) as {
					buildList: Array<{ id: string }>;
				};
				expect(savedTrace.buildList).toHaveLength(1);
			} finally {
				proc.kill();
				await proc.exited;
			}
		}, 30000);
	});

	describe("test command", () => {
		test("should display help for test command", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "test", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("test");
			expect(output).toContain("start");
			expect(proc.exitCode).toBe(0);
		});

		test("should display help for test start command", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "test", "start", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("test server");
			expect(output).toContain("web GUI");
			expect(proc.exitCode).toBe(0);
		});

		test("should start test server and output GUI URL", async () => {
			// Create a minimal test project
			const projectName = "test-server-project";
			const projectPath = join(TEST_DIR, projectName);
			mkdirSync(projectPath, { recursive: true });

			// Create minimal config
			const configContent = `
import type { FrameMasterConfig } from "frame-master/server/type";

export default {
  HTTPServer: {
    port: 3050,
  },
  plugins: [],
} satisfies FrameMasterConfig;
`;
			writeFileSync(join(projectPath, "frame-master.config.ts"), configContent);

			// Create minimal package.json
			writeFileSync(
				join(projectPath, "package.json"),
				JSON.stringify(
					{
						name: projectName,
						version: "1.0.0",
						type: "module",
					},
					null,
					2,
				),
			);

			// Create pages directory
			mkdirSync(join(projectPath, "src", "pages"), { recursive: true });
			writeFileSync(
				join(projectPath, "src", "pages", "index.tsx"),
				`export default function Index() { return <div>Test</div>; }`,
			);

			// Start test server with timeout
			const proc = Bun.spawn(["bun", CLI_PATH, "test", "start"], {
				cwd: projectPath,
				stdout: "pipe",
				stderr: "pipe",
			});

			// Wait for initial output
			const reader = proc.stdout.getReader();
			const decoder = new TextDecoder();
			let output = "";
			let attempts = 0;
			const maxAttempts = 20;

			while (attempts < maxAttempts) {
				const { value, done } = await reader.read();
				if (done) break;

				output += decoder.decode(value);

				// Check if we have the expected output
				if (
					output.includes("Test Server") ||
					output.includes("GUI available")
				) {
					break;
				}

				attempts++;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			// Kill the process
			proc.kill();
			await proc.exited;

			// Verify output contains expected messages
			expect(output).toMatch(/Test Server|GUI available|localhost:3001/);
		}, 30000);

		test("should fail gracefully without config file", async () => {
			const projectName = "test-no-config";
			const projectPath = join(TEST_DIR, projectName);
			mkdirSync(projectPath, { recursive: true });

			const proc = Bun.spawn(["bun", CLI_PATH, "test", "start"], {
				cwd: projectPath,
				stdout: "pipe",
				stderr: "pipe",
			});

			const stderr = await new Response(proc.stderr).text();
			const stdout = await new Response(proc.stdout).text();
			await proc.exited;

			const output = stderr + stdout;
			expect(output).toMatch(/config|configuration|not found/i);
			expect(proc.exitCode).not.toBe(0);
		}, 15000);
	});

	describe("dev and start commands", () => {
		test("should display help for dev command", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "dev", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("development server");
			expect(proc.exitCode).toBe(0);
		});

		test("should display help for start command", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "start", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain("production server");
			expect(proc.exitCode).toBe(0);
		});

		// Note: We don't actually start servers in tests to avoid port conflicts
		// and hanging test processes. These would require more sophisticated
		// testing with timeouts and process management.
	});

	describe("extended CLI command from plugin", () => {
		test("should add custom command from plugin", async () => {
			const projectName = "test-plugin-list";
			const projectPath = join(TEST_DIR, projectName);
			mkdirSync(projectPath, { recursive: true });

			// Create a config file with plugins
			const configContent = `
import type { FrameMasterConfig } from "frame-master/server/type";

export default {
  HTTPServer: {
    port: 3000,
  },
  plugins: [
    {
      name: "test-plugin",
      version: "1.0.0",
      cli: (cmd) => cmd.command("list").description("list available plugins extended CLI").action(() => {
        console.log("Listing extended CLI plugins...");
      }),
    },
  ],
} satisfies FrameMasterConfig;
`;
			writeFileSync(join(projectPath, "frame-master.config.ts"), configContent);

			const proc = Bun.spawnSync(["bun", CLI_PATH, "extended-cli", "list"], {
				cwd: projectPath,
			});

			const out = new TextDecoder().decode(proc.stdout);

			expect(out).toContain("Listing extended CLI plugins...");
			expect(proc.exitCode).toBe(0);
		});
	});

	describe("error handling", () => {
		test("should handle invalid command", async () => {
			const proc = Bun.spawn(["bun", CLI_PATH, "invalid-command"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			});

			const stderr = await new Response(proc.stderr).text();
			await proc.exited;

			expect(stderr).toContain("unknown command");
			expect(proc.exitCode).not.toBe(0);
		});
	});
});
