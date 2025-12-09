import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Hot Reload Test Suite for Frame-Master
 *
 * Tests the reloadPlugins() functionality that hot-reloads
 * the config file, plugin loader, and builder.
 */

const TEST_DIR = join(tmpdir(), `frame-master-hot-reload-test-${Date.now()}`);
const CONFIG_FILE = "frame-master.config.ts";

// Store original cwd to restore later
const originalCwd = process.cwd();

// Helper to create config file content
function createConfigContent(
  port: number,
  plugins: Array<{ name: string; version: string; hasRouter?: boolean }>
) {
  const pluginDefs = plugins
    .map((p) => {
      if (p.hasRouter) {
        return `{
      name: "${p.name}",
      version: "${p.version}",
      router: {
        request: () => {},
      },
    }`;
      }
      return `{
      name: "${p.name}",
      version: "${p.version}",
    }`;
    })
    .join(",\n    ");

  return `
import type { FrameMasterConfig } from "${join(
    originalCwd,
    "src/server/type.ts"
  )}";

export default {
  HTTPServer: {
    port: ${port},
  },
  plugins: [
    ${pluginDefs}
  ],
} satisfies FrameMasterConfig;
`;
}

// Helper to reset config state before each test
async function resetConfigState() {
  const { configManager } = await import("../src/server/config");
  configManager.setMockConfig(null as any);
}

// Helper to fully reset all state between tests
async function resetAllState() {
  // Reset config
  const { configManager } = await import("../src/server/config");
  configManager.setMockConfig(null as any);

  // Reset plugin loader
  const { resetPluginLoaderState } = await import(
    "../src/plugins/plugin-loader"
  );
  resetPluginLoaderState();

  // Reset builder
  const { resetBuilderState } = await import("../src/build");
  resetBuilderState();
}

beforeAll(() => {
  // Create test directory
  mkdirSync(TEST_DIR, { recursive: true });
  // Change to test directory for config loading
  process.chdir(TEST_DIR);
});

beforeEach(async () => {
  // Reset all module state before each test
  await resetAllState();
});

afterAll(() => {
  // Restore original cwd
  process.chdir(originalCwd);

  // Cleanup test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("hot reload", () => {
  describe("reloadConfig", () => {
    test("should reload config file with cache busting", async () => {
      await resetConfigState();

      // Create initial config
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(3000, [
          { name: "config-test-v1", version: "1.0.0" },
        ])
      );

      // Import and initialize
      const { configManager, reloadConfig } = await import(
        "../src/server/config"
      );

      // Load initial config using reloadConfig to bust any cache
      await reloadConfig();

      // Verify initial state
      expect(configManager.getConfig()?.HTTPServer?.port).toBe(3000);
      expect(configManager.getConfig()?.plugins?.[0]?.name).toBe(
        "config-test-v1"
      );

      // Update config file
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(4000, [
          { name: "config-test-v2", version: "2.0.0" },
        ])
      );

      // Reload config (should bust cache)
      await reloadConfig();

      // Verify config was reloaded with new values
      expect(configManager.getConfig()?.HTTPServer?.port).toBe(4000);
      expect(configManager.getConfig()?.plugins?.[0]?.name).toBe(
        "config-test-v2"
      );
    });
  });

  describe("reloadPluginLoader", () => {
    test("should reinitialize plugin loader with new config", async () => {
      await resetConfigState();

      // Create config with initial plugin
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(5000, [
          { name: "loader-test-v1", version: "1.0.0" },
        ])
      );

      const { reloadConfig, getConfig } = await import("../src/server/config");
      const { reloadPluginLoader, getPluginLoader } = await import(
        "../src/plugins/plugin-loader"
      );

      // Load config using reloadConfig
      await reloadConfig();

      // Initialize plugin loader
      reloadPluginLoader();

      // Verify initial plugin
      expect(getPluginLoader()?.getPlugins()[0]?.name).toBe("loader-test-v1");

      // Update config with different plugins
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(5001, [
          { name: "loader-test-v2", version: "2.0.0" },
          { name: "loader-test-extra", version: "1.0.0" },
        ])
      );

      // Reload config first
      await reloadConfig();

      // Then reload plugin loader
      reloadPluginLoader();

      // Verify plugins were updated
      expect(getPluginLoader()?.getPlugins().length).toBe(2);
      expect(getPluginLoader()?.getPlugins()[0]?.name).toBe("loader-test-v2");
      expect(getPluginLoader()?.getPlugins()[1]?.name).toBe(
        "loader-test-extra"
      );
    });

    test("should clear plugin caches when reloading", async () => {
      // Create config with plugin that has router
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(6000, [
          { name: "cache-test", version: "1.0.0", hasRouter: true },
        ])
      );

      const { reloadConfig } = await import("../src/server/config");
      const { reloadPluginLoader, getPluginLoader } = await import(
        "../src/plugins/plugin-loader"
      );

      // Load config
      await reloadConfig();

      // Initialize plugin loader
      reloadPluginLoader();

      // Access router plugins (populates cache)
      const routerPlugins1 = getPluginLoader()?.getPluginByName("router");
      expect(routerPlugins1?.length).toBe(1);
      expect(routerPlugins1?.[0]?.name).toBe("cache-test");

      // Access again (uses cache)
      const routerPlugins2 = getPluginLoader()?.getPluginByName("router");
      expect(routerPlugins2?.length).toBe(1);

      // Update config to remove router
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(6001, [
          { name: "cache-test-no-router", version: "2.0.0", hasRouter: false },
        ])
      );

      // Small delay to ensure file system has updated
      await Bun.sleep(10);

      // Reload everything
      await reloadConfig();
      reloadPluginLoader();

      // Cache should be cleared, new config should be used
      const routerPlugins3 = getPluginLoader()?.getPluginByName("router");
      expect(routerPlugins3?.length).toBe(0);
    });
  });

  describe("reloadBuilder", () => {
    test("should rebuild builder with updated plugin configurations", async () => {
      await resetConfigState();

      // Create config with build plugin
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        `
import type { FrameMasterConfig } from "${join(
          originalCwd,
          "src/server/type.ts"
        )}";

export default {
  HTTPServer: { port: 7000 },
  plugins: [
    {
      name: "build-test-v1",
      version: "1.0.0",
      build: {
        buildConfig: {
          target: "browser",
        },
      },
    },
  ],
} satisfies FrameMasterConfig;
`
      );

      const { reloadConfig } = await import("../src/server/config");
      const { reloadPluginLoader } = await import(
        "../src/plugins/plugin-loader"
      );
      const { reloadBuilder, getBuilder } = await import("../src/build");

      // Initialize everything
      await reloadConfig();
      reloadPluginLoader();
      await reloadBuilder();

      // Verify builder exists
      expect(getBuilder()).not.toBeNull();

      // Update config with different build config
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        `
import type { FrameMasterConfig } from "${join(
          originalCwd,
          "src/server/type.ts"
        )}";

export default {
  HTTPServer: { port: 7001 },
  plugins: [
    {
      name: "build-test-v2",
      version: "2.0.0",
      build: {
        buildConfig: {
          target: "bun",
          minify: true,
        },
        enableLoging: true,
      },
    },
  ],
} satisfies FrameMasterConfig;
`
      );

      // Reload everything
      await reloadConfig();
      reloadPluginLoader();
      await reloadBuilder();

      // Verify builder was recreated
      const newBuilder = getBuilder();
      expect(newBuilder).not.toBeNull();
      expect(newBuilder?.isLogEnabled).toBe(true);
    });
  });

  describe("reloadPlugins (full integration)", () => {
    test("should reload config, plugins, and builder in one call", async () => {
      await resetConfigState();

      // Create initial config
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(8000, [
          { name: "integration-test-v1", version: "1.0.0" },
        ])
      );

      const { getConfig, reloadConfig } = await import("../src/server/config");
      const { reloadPluginLoader, getPluginLoader } = await import(
        "../src/plugins/plugin-loader"
      );
      const { reloadBuilder } = await import("../src/build");
      const { reloadPlugins } = await import("../src/utils");

      // Initialize everything
      await reloadConfig();
      reloadPluginLoader();
      await reloadBuilder();

      // Verify initial state
      expect(getConfig()?.HTTPServer?.port).toBe(8000);
      expect(getPluginLoader()?.getPlugins()[0]?.name).toBe(
        "integration-test-v1"
      );

      // Update config
      writeFileSync(
        join(TEST_DIR, CONFIG_FILE),
        createConfigContent(9000, [
          { name: "integration-test-v2", version: "2.0.0" },
          { name: "integration-test-extra", version: "1.0.0" },
        ])
      );

      // Use reloadPlugins to reload everything
      await reloadPlugins();

      // Verify everything was reloaded
      expect(getConfig()?.HTTPServer?.port).toBe(9000);
      expect(getPluginLoader()?.getPlugins().length).toBe(2);
      expect(getPluginLoader()?.getPlugins()[0]?.name).toBe(
        "integration-test-v2"
      );
      expect(getPluginLoader()?.getPlugins()[1]?.name).toBe(
        "integration-test-extra"
      );
    });
  });
});
