import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";

describe("config hot reload", () => {
  const testDir = join(import.meta.dirname, ".test-config-reload");
  const configFile = join(testDir, "frame-master.config.ts");

  beforeEach(async () => {
    // Create test directory
    await mkdir(testDir, { recursive: true });

    // Create initial config file
    await writeFile(
      configFile,
      `export default {
  HTTPServer: { port: 3000 },
  plugins: []
};`
    );
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("configPath", () => {
    test("should return the absolute path to config file", async () => {
      const { configPath } = await import("../src/server/config");

      const path = configPath();

      expect(path).toBe(join(process.cwd(), "frame-master.config.ts"));
    });

    test("should return a string path", async () => {
      const { configPath } = await import("../src/server/config");

      const path = configPath();

      expect(typeof path).toBe("string");
      expect(path.endsWith("frame-master.config.ts")).toBe(true);
    });
  });

  describe("watchFile utility", () => {
    test("should create a watcher for a specific file", async () => {
      const { watchFile } = await import("../src/utils");

      const callback = mock(() => {});
      const watcher = await watchFile(configFile, callback);

      expect(watcher).toBeDefined();
      expect(watcher.isActive()).toBe(true);

      // Clean up
      watcher.stop();
      expect(watcher.isActive()).toBe(false);
    });

    test("should trigger callback when file changes", async () => {
      const { watchFile } = await import("../src/utils");

      let callCount = 0;
      let lastEvent = "" as string;

      const watcher = await watchFile(
        configFile,
        (event, filename) => {
          callCount++;
          lastEvent = event;
        },
        { debounceDelay: 50 }
      );

      // Wait for watcher to be ready
      await new Promise((r) => setTimeout(r, 100));

      // Modify the file
      await writeFile(
        configFile,
        `export default {
  HTTPServer: { port: 4000 },
  plugins: []
};`
      );

      // Wait for debounce and callback
      await new Promise((r) => setTimeout(r, 200));

      expect(callCount).toBeGreaterThanOrEqual(1);
      expect(["change", "rename"]).toContain(lastEvent);

      // Clean up
      watcher.stop();
    });

    test("should stop watching when stop() is called", async () => {
      const { watchFile } = await import("../src/utils");

      let callCount = 0;

      const watcher = await watchFile(
        configFile,
        () => {
          callCount++;
        },
        { debounceDelay: 50 }
      );

      // Stop watching
      watcher.stop();
      expect(watcher.isActive()).toBe(false);

      // Modify the file after stopping
      await writeFile(configFile, `export default { plugins: [] };`);

      // Wait to ensure no callback is triggered
      await new Promise((r) => setTimeout(r, 200));

      expect(callCount).toBe(0);
    });

    test("should handle relative file paths", async () => {
      const { watchFile } = await import("../src/utils");

      // Use relative path from cwd
      const relativePath = configFile.replace(process.cwd() + "/", "");
      const callback = mock(() => {});

      const watcher = await watchFile(relativePath, callback);

      expect(watcher.isActive()).toBe(true);

      watcher.stop();
    });
  });

  describe("config watcher integration", () => {
    test("getConfigWatcher should return null when not initialized", async () => {
      const { getConfigWatcher, resetInitState } = await import(
        "../src/server/init"
      );

      resetInitState();

      const watcher = getConfigWatcher();
      expect(watcher).toBeNull();
    });

    test("resetInitState should stop and clear the config watcher", async () => {
      const { getConfigWatcher, resetInitState } = await import(
        "../src/server/init"
      );

      resetInitState();

      // After reset, watcher should be null
      expect(getConfigWatcher()).toBeNull();
    });
  });

  describe("FileSystemWatcher for single file", () => {
    test("should create watcher with correct watch count", async () => {
      const { createWatcher } = await import("../src/server/watch");

      const watcher = await createWatcher({
        path: configFile,
        callback: () => {},
        debounceDelay: 50,
      });

      expect(watcher.isActive()).toBe(true);
      expect(watcher.getWatchCount()).toBe(1);

      watcher.stop();
      expect(watcher.isActive()).toBe(false);
      expect(watcher.getWatchCount()).toBe(0);
    });

    test("should properly clean up on stop", async () => {
      const { createWatcher } = await import("../src/server/watch");

      const watcher = await createWatcher({
        path: configFile,
        callback: () => {},
        debounceDelay: 50,
      });

      expect(watcher.isActive()).toBe(true);

      watcher.stop();

      expect(watcher.isActive()).toBe(false);
      expect(watcher.getWatchCount()).toBe(0);
    });
  });
});
