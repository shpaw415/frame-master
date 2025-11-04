import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * CLI Test Suite for Frame-Master
 *
 * Tests the CLI commands using Bun's shell execution and test API.
 * Creates temporary test projects to verify CLI behavior.
 */

const TEST_DIR = join(tmpdir(), `frame-master-cli-test-${Date.now()}`);
const CLI_PATH = join(process.cwd(), "bin", "index.ts");

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
      const output = await Bun.$`bun ${CLI_PATH} create --help`.text();

      expect(output).toContain("Create a new frame-master project");
      expect(output).toContain("minimal");
      expect(output).toContain("-t, --type");
    });

    test("should create a minimal project", async () => {
      const projectName = "test-minimal-project";
      const projectPath = join(TEST_DIR, projectName);
      const output =
        await Bun.$`bun ${CLI_PATH} create ${projectName} --type minimal`
          .cwd(TEST_DIR)
          .text();

      // Check if project was created
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(join(projectPath, "package.json"))).toBe(true);
      expect(existsSync(join(projectPath, "frame-master.config.ts"))).toBe(
        true
      );
      expect(existsSync(join(projectPath, ".frame-master"))).toBe(true);
      expect(existsSync(join(projectPath, "bunfig.toml"))).toBe(true);

      // Check success message
      expect(output).toContain("Successfully created");
      expect(output).toContain(projectName);
    }, 30000); // Longer timeout for project creation

    test("should create project with default type when not specified", async () => {
      const projectName = "test-default-project";
      const projectPath = join(TEST_DIR, projectName);

      const proc = Bun.spawn(["bun", CLI_PATH, "create", projectName], {
        cwd: TEST_DIR,
        stdout: "pipe",
        stderr: "pipe",
      });

      await proc.exited;

      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(join(projectPath, "package.json"))).toBe(true);
      expect(proc.exitCode).toBe(0);
    }, 30000);
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
          2
        )
      );

      // Install frame-master (simulate)
      await Bun.$`bun add frame-master`.cwd(projectPath).quiet();

      // Run init
      const proc = Bun.spawn(["bun", CLI_PATH, "init"], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      // Check if files were created
      expect(existsSync(join(projectPath, "frame-master.config.ts"))).toBe(
        true
      );
      expect(existsSync(join(projectPath, ".frame-master"))).toBe(true);
      expect(existsSync(join(projectPath, "bunfig.toml"))).toBe(true);
      expect(existsSync(join(projectPath, ".env"))).toBe(true);

      // Check package.json scripts
      const packageJson = JSON.parse(
        await Bun.file(join(projectPath, "package.json")).text()
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
        JSON.stringify({ name: projectName, version: "1.0.0" }, null, 2)
      );

      // Create existing config file
      const existingConfig = "// My custom config";
      writeFileSync(
        join(projectPath, "frame-master.config.ts"),
        existingConfig
      );

      await Bun.$`bun add frame-master`.cwd(projectPath).quiet();

      const proc = Bun.spawn(["bun", CLI_PATH, "init"], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      // Check that existing file wasn't overwritten
      const configContent = await Bun.file(
        join(projectPath, "frame-master.config.ts")
      ).text();
      expect(configContent).toBe(existingConfig);

      // Warning goes to stderr
      expect(stderr).toContain("already exists");
      expect(stdout).toContain("initialized");
    }, 30000);
  });

  describe("plugin command", () => {
    test("should display help for plugin command", async () => {
      const proc = Bun.spawn(["bun", CLI_PATH, "plugin", "--help"], {
        cwd: process.cwd(),
        stdout: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      expect(output).toContain("Manage Frame-Master plugins");
      expect(output).toContain("list");
      expect(output).toContain("info");
      expect(output).toContain("validate");
      expect(output).toContain("create");
      expect(proc.exitCode).toBe(0);
    });

    test("should list plugins with list command", async () => {
      // Create a test project with config
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
      priority: 1,
    },
  ],
} satisfies FrameMasterConfig;
`;
      writeFileSync(join(projectPath, "frame-master.config.ts"), configContent);

      const output = await Bun.$`bun ${CLI_PATH} plugin list`
        .cwd(projectPath)
        .text();

      expect(output).toContain("Installed Plugins");
      expect(output).toContain("test-plugin");
    }, 15000);

    test("should show verbose plugin information", async () => {
      const projectName = "test-plugin-verbose";
      const projectPath = join(TEST_DIR, projectName);
      mkdirSync(projectPath, { recursive: true });

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
      priority: 5,
      router: {
        before_request: async () => {},
      },
      serverStart: async () => {},
    },
  ],
} satisfies FrameMasterConfig;
`;
      writeFileSync(join(projectPath, "frame-master.config.ts"), configContent);

      const proc = Bun.spawn(["bun", CLI_PATH, "plugin", "list", "--verbose"], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      expect(output).toContain("test-plugin");
      expect(output).toContain("Priority");
      expect(output).toContain("Features");
    }, 15000);

    test("should handle empty plugin list", async () => {
      const projectName = "test-no-plugins";
      const projectPath = join(TEST_DIR, projectName);
      mkdirSync(projectPath, { recursive: true });

      const configContent = `
import type { FrameMasterConfig } from "frame-master/server/type";

export default {
  HTTPServer: {
    port: 3000,
  },
  plugins: [],
} satisfies FrameMasterConfig;
`;
      writeFileSync(join(projectPath, "frame-master.config.ts"), configContent);

      const proc = Bun.spawn(["bun", CLI_PATH, "plugin", "list"], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      expect(output).toContain("No plugins installed");
      expect(proc.exitCode).toBe(0);
    }, 15000);
  });

  describe("build command", () => {
    test("should display help for build command", async () => {
      const proc = await Bun.$`bun ${CLI_PATH} build --help`.cwd(process.cwd());

      expect(Bun.stripANSI(proc.text())).toContain(
        "Build the Frame Master project"
      );
      expect(proc.exitCode).toBe(0);
    });

    test("should build project successfully", async () => {
      const projectName = "test-build-project";
      const projectPath = join(TEST_DIR, projectName);

      // Create project structure
      mkdirSync(join(projectPath, "src"), { recursive: true });
      mkdirSync(join(projectPath, ".frame-master"), { recursive: true });

      const testProjectEntryPoint = join(projectPath, "src", "index.ts");

      // Create minimal config
      const configContent = (
        await Bun.file(join(import.meta.dir, "default.config.ts")).text()
      ).replaceAll("{{TEST_PROJECT_ENTRYPOINT}}", testProjectEntryPoint);

      writeFileSync(join(projectPath, "frame-master.config.ts"), configContent);

      // Create a simple entrypoint
      writeFileSync(testProjectEntryPoint, `console.log("Hello from build");`);

      // Set NODE_ENV
      process.env.NODE_ENV = "development";

      const stdout = await Bun.$`bun ${CLI_PATH} build`
        .cwd(projectPath)
        .env({ ...process.env, NODE_ENV: "development" });

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
          2
        )
      );

      // Create pages directory
      mkdirSync(join(projectPath, "src", "pages"), { recursive: true });
      writeFileSync(
        join(projectPath, "src", "pages", "index.tsx"),
        `export default function Index() { return <div>Test</div>; }`
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

    test("should handle missing required arguments", async () => {
      const proc = Bun.spawn(["bun", CLI_PATH, "create"], {
        cwd: TEST_DIR,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      expect(stderr).toContain("missing required argument");
      expect(proc.exitCode).not.toBe(0);
    });
  });
});
