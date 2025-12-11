import {
  describe,
  expect,
  test,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { DirectiveTool, directiveToolSingleton } from "../src/plugins/utils";
import { setMockConfig } from "../src/server/config";
import { reloadPluginLoader, pluginLoader } from "../src/plugins/plugin-loader";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-directive-tmp");

// Setup test files
beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("DirectiveTool", () => {
  describe("addDirective", () => {
    test("should add a custom directive", () => {
      const tool = new DirectiveTool();
      tool.addDirective(
        "use-custom",
        /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]custom['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
      );

      // The directive should be registered
      // We can verify by testing a file with that directive
      const testFile = join(TEST_DIR, "custom-directive-test.ts");
      writeFileSync(testFile, '"use-custom";\nexport const x = 1;');

      // pathIs should detect the directive
      expect(tool.pathIs("use-custom" as any, testFile)).resolves.toBe(true);
    });

    test("should support chaining", () => {
      const tool = new DirectiveTool();
      const result = tool.addDirective("dir-a", /a/).addDirective("dir-b", /b/);

      expect(result).toBe(tool);
    });
  });

  describe("base directives", () => {
    test("should detect use-client directive", async () => {
      const tool = new DirectiveTool();
      const testFile = join(TEST_DIR, "use-client-test.tsx");
      writeFileSync(testFile, '"use client";\nexport default function() {}');

      const result = await tool.pathIs("use-client", testFile);
      expect(result).toBe(true);
    });

    test("should detect use-server directive", async () => {
      const tool = new DirectiveTool();
      const testFile = join(TEST_DIR, "use-server-test.ts");
      writeFileSync(
        testFile,
        '"use server";\nexport async function action() {}'
      );

      const result = await tool.pathIs("use-server", testFile);
      expect(result).toBe(true);
    });

    test("should detect use-static directive", async () => {
      const tool = new DirectiveTool();
      const testFile = join(TEST_DIR, "use-static-test.ts");
      writeFileSync(testFile, '"use-static";\nexport const data = {};');

      const result = await tool.pathIs("use-static", testFile);
      expect(result).toBe(true);
    });

    test("should detect server-only directive", async () => {
      const tool = new DirectiveTool();
      const testFile = join(TEST_DIR, "server-only-test.ts");
      writeFileSync(testFile, '"server only";\nexport const secret = "abc";');

      const result = await tool.pathIs("server-only", testFile);
      expect(result).toBe(true);
    });

    test("should default to use-server when no directive", async () => {
      const tool = new DirectiveTool();
      const testFile = join(TEST_DIR, "no-directive-test.ts");
      writeFileSync(testFile, "export const x = 1;");

      const result = await tool.pathIs("use-server", testFile);
      expect(result).toBe(true);
    });
  });
});

describe("Plugin Directives Registration", () => {
  test("should register directives from plugin config to directiveToolSingleton", async () => {
    // Create a fresh DirectiveTool to track what gets registered
    const customDirectiveRegex =
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]my-plugin-directive['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m;

    // Setup mock config with a plugin that has directives
    setMockConfig({
      HTTPServer: {
        port: 3010,
      },
      plugins: [
        {
          name: "test-directive-plugin",
          version: "1.0.0",
          directives: [
            {
              name: "use-my-plugin-directive",
              regex: customDirectiveRegex,
            },
          ],
        },
      ],
    });

    // Reload plugin loader to trigger directive registration
    reloadPluginLoader();

    // Create a test file with the custom directive
    const testFile = join(TEST_DIR, "plugin-directive-test.ts");
    writeFileSync(testFile, '"use-my-plugin-directive";\nexport const x = 1;');

    // The directiveToolSingleton should now recognize the custom directive
    const result = await directiveToolSingleton.pathIs(
      "use-my-plugin-directive" as any,
      testFile
    );
    expect(result).toBe(true);
  });

  test("should register multiple directives from multiple plugins", async () => {
    const directiveARegex =
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]directive[-\s]a['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m;
    const directiveBRegex =
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]directive[-\s]b['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m;

    setMockConfig({
      HTTPServer: {
        port: 3011,
      },
      plugins: [
        {
          name: "plugin-a",
          version: "1.0.0",
          directives: [{ name: "directive-a", regex: directiveARegex }],
        },
        {
          name: "plugin-b",
          version: "1.0.0",
          directives: [{ name: "directive-b", regex: directiveBRegex }],
        },
      ],
    });

    reloadPluginLoader();

    // Test directive-a
    const testFileA = join(TEST_DIR, "directive-a-test.ts");
    writeFileSync(testFileA, '"directive-a";\nexport const a = 1;');
    const resultA = await directiveToolSingleton.pathIs(
      "directive-a" as any,
      testFileA
    );
    expect(resultA).toBe(true);

    // Test directive-b
    const testFileB = join(TEST_DIR, "directive-b-test.ts");
    writeFileSync(testFileB, '"directive-b";\nexport const b = 2;');
    const resultB = await directiveToolSingleton.pathIs(
      "directive-b" as any,
      testFileB
    );
    expect(resultB).toBe(true);
  });

  test("should handle plugins without directives gracefully", () => {
    setMockConfig({
      HTTPServer: {
        port: 3012,
      },
      plugins: [
        {
          name: "plugin-no-directives",
          version: "1.0.0",
          // No directives property
        },
        {
          name: "plugin-empty-directives",
          version: "1.0.0",
          directives: [], // Empty array
        },
      ],
    });

    // Should not throw
    expect(() => reloadPluginLoader()).not.toThrow();
  });

  test("should skip invalid directive entries", () => {
    setMockConfig({
      HTTPServer: {
        port: 3013,
      },
      plugins: [
        {
          name: "plugin-invalid-directives",
          version: "1.0.0",
          directives: [
            { name: "valid-directive", regex: /valid/ },
            { name: "", regex: /empty-name/ } as any, // Empty name
            { name: "missing-regex" } as any, // Missing regex
            { regex: /missing-name/ } as any, // Missing name
          ],
        },
      ],
    });

    // Should not throw and should handle gracefully
    expect(() => reloadPluginLoader()).not.toThrow();
  });
});
